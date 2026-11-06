// The data export (GDPR articles 15 and 20): everything stored about a user as
// a ZIP with data.json and the original files. Library and area data are not
// about the user and stay out. Secrets stay out too: every auth table is read
// with an explicit select, so that a new column is not exported by accident.
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate'
import type { PrismaClient } from '@prisma/client'
import { getObject } from '@/server/storage/s3'
import { normaliseEmail } from './allowlist'

export const EXPORT_FORMAT_VERSION = 1

export async function collectAccountData(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  const [
    allowlistEntry,
    sessions,
    logins,
    claudeConsents,
    claudeTokens,
    defaultAssumptions,
    houses,
  ] = await Promise.all([
    prisma.allowedEmail.findUnique({
      where: { email: normaliseEmail(user.email) },
      select: { email: true, createdAt: true },
    }),
    prisma.session.findMany({
      where: { userId },
      select: {
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
      },
    }),
    prisma.account.findMany({
      where: { userId },
      select: { providerId: true, createdAt: true, updatedAt: true },
    }),
    prisma.oauthConsent.findMany({
      where: { userId },
      select: {
        clientId: true,
        scopes: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.oauthRefreshToken.findMany({
      where: { userId },
      select: {
        clientId: true,
        scopes: true,
        createdAt: true,
        expiresAt: true,
        revoked: true,
      },
    }),
    prisma.assumption.findMany({
      where: { ownerId: userId, houseId: null },
      include: { changeset: true },
      orderBy: { createdAt: 'asc' },
    }),
    // Everything, also what the user never sees: drafts, rejected changesets,
    // retracted values and replaced work items are data about them too.
    prisma.house.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'asc' },
      include: {
        changesets: true,
        components: true,
        observations: true,
        documents: { omit: { storagePath: true } },
        workItems: true,
        retractions: true,
        assumptions: true,
        forecasts: true,
      },
    }),
  ])
  return {
    user,
    allowlistEntry,
    sessions,
    logins,
    claudeConsents,
    claudeTokens,
    defaultAssumptions,
    houses,
  }
}

export type AccountData = Awaited<ReturnType<typeof collectAccountData>>

// Where a document's file goes in the ZIP. The filename comes from the upload
// or from Claude, so nothing in it may climb out of the folder when unpacked.
export function exportFilePath(documentId: string, filename: string | null) {
  const safe = (filename ?? '')
    .replace(/[^\p{L}\p{N}._ -]/gu, '_')
    .replace(/^[. ]+/, '')
    .slice(-100)
  return `documents/${documentId}${safe ? `-${safe}` : ''}`
}

export function exportArchiveName(now = new Date()) {
  return `husvan-export-${now.toISOString().slice(0, 10)}.zip`
}

type StoredFile = {
  documentId: string
  path: string
  storagePath: string
}

type ReadFile = (storagePath: string) => Promise<ReadableStream<Uint8Array>>

const readStoredFile: ReadFile = async (storagePath) => {
  const object = await getObject(storagePath)
  if (!object.ok || !object.body)
    throw new Error(`Storage answered ${object.status}`)
  return object.body
}

// Which documents have a file, and where each goes in the ZIP.
export async function listStoredFiles(
  prisma: PrismaClient,
  userId: string
): Promise<StoredFile[]> {
  const documents = await prisma.document.findMany({
    where: { house: { ownerId: userId }, storagePath: { not: null } },
    select: { id: true, filename: true, storagePath: true },
  })
  return documents.map((d) => ({
    documentId: d.id,
    path: exportFilePath(d.id, d.filename),
    storagePath: d.storagePath!,
  }))
}

// Streams the ZIP, a file at a time, so that large uploads do not sit in memory
// together. The files go first: a file storage cannot give back must not break
// the whole export, so data.json, written last, lists where each file is and
// which ones are missing. Anything else that fails aborts the stream, and the
// browser reports a failed download instead of saving half an archive.
export function accountArchive(
  data: AccountData,
  files: StoredFile[],
  { readFile = readStoredFile, now = new Date() } = {}
): ReadableStream<Uint8Array> {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const zip = new Zip((error, chunk, final) => {
    if (error) {
      writer.abort(error).catch(() => {})
      return
    }
    writer.write(chunk).catch(() => {})
    if (final) writer.close().catch(() => {})
  })

  async function write() {
    const included = new Map<string, string>()
    const missing: { documentId: string; path: string }[] = []
    for (const file of files) {
      // Already compressed or small; stored as they are.
      const entry = new ZipPassThrough(file.path)
      let started = false
      try {
        const reader = (await readFile(file.storagePath)).getReader()
        zip.add(entry)
        started = true
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          entry.push(value)
          await writer.ready
        }
        entry.push(new Uint8Array(0), true)
        included.set(file.documentId, file.path)
      } catch (error) {
        // Half a file is already in the archive; only the whole export can be
        // failed now.
        if (started) throw error
        console.error('[exportAccount] file', file.documentId, error)
        missing.push({ documentId: file.documentId, path: file.path })
      }
    }

    const json = new ZipDeflate('data.json', { level: 6 })
    zip.add(json)
    json.push(
      strToU8(
        JSON.stringify(
          {
            format: EXPORT_FORMAT_VERSION,
            exportedAt: now.toISOString(),
            ...data,
            files: [...included].map(([documentId, path]) => ({
              documentId,
              path,
            })),
            filesThatCouldNotBeRead: missing,
          },
          null,
          2
        )
      ),
      true
    )
    zip.end()
  }

  write().catch((error) => {
    console.error('[exportAccount]', error)
    writer.abort(error).catch(() => {})
  })
  return readable
}
