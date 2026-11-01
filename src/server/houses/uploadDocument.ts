// The original file of a document, uploaded through the web (CLAUDE.md,
// "Spara originalet"). Claude saves a document's text and interpretation
// through MCP, often with the file's sha256; the upload is matched to it by
// that hash, or to the document the user picks, or becomes a new document.
// Setting storagePath, and the file's own metadata where it is missing, is
// the one change made to a document after it is saved.
import type { DocumentType, PrismaClient } from '@prisma/client'
import { objectKey, putObject, sha256Hex } from '@/server/storage/s3'
import { saveDocument } from './saveDocument'

// PDFs, photos and plain text; a listing saved as a web page goes through
// MCP as text, not here.
export const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'text/plain',
]
export const MAX_BYTES = 25 * 1024 * 1024

export type UploadResult =
  | { ok: true; documentId: string; matched: 'sha256' | 'document' | 'new' }
  | {
      ok: false
      status: 400 | 404 | 409 | 413
      error:
        | 'not_found'
        | 'type'
        | 'too_large'
        | 'other_house'
        | 'hash_mismatch'
        | 'already_uploaded'
    }

export async function uploadDocument(
  prisma: PrismaClient,
  {
    ownerId,
    houseId,
    documentId,
    type,
    file,
  }: {
    ownerId: string
    houseId: string
    // The document the file belongs to, when the user picks one.
    documentId?: string
    // The type of a new document.
    type: DocumentType
    file: { name: string; mime: string; bytes: Uint8Array }
  }
): Promise<UploadResult> {
  const house = await prisma.house.findFirst({
    where: { id: houseId, ownerId },
    select: { id: true },
  })
  if (!house) return { ok: false, status: 404, error: 'not_found' }
  if (!ALLOWED_TYPES.includes(file.mime))
    return { ok: false, status: 400, error: 'type' }
  if (file.bytes.byteLength > MAX_BYTES)
    return { ok: false, status: 413, error: 'too_large' }

  const sha256 = sha256Hex(file.bytes)
  const same = await prisma.document.findFirst({
    where: { sha256 },
    select: { id: true, houseId: true, storagePath: true },
  })
  if (same && same.houseId !== houseId)
    return { ok: false, status: 409, error: 'other_house' }

  let target: { id: string; storagePath: string | null } | null = same
  if (!target && documentId) {
    const picked = await prisma.document.findFirst({
      where: { id: documentId, houseId, changeset: { status: 'APPROVED' } },
      select: { id: true, storagePath: true, sha256: true },
    })
    if (!picked) return { ok: false, status: 404, error: 'not_found' }
    if (picked.storagePath)
      return { ok: false, status: 409, error: 'already_uploaded' }
    // Claude stated another file's hash for this document.
    if (picked.sha256 && picked.sha256 !== sha256)
      return { ok: false, status: 409, error: 'hash_mismatch' }
    target = picked
  }
  // The same file again is already saved.
  if (same?.storagePath)
    return { ok: true, documentId: same.id, matched: 'sha256' }

  const key = objectKey(houseId, sha256, file.name)
  await putObject(key, file.bytes, file.mime, sha256)

  if (target) {
    const doc = await prisma.document.findUniqueOrThrow({
      where: { id: target.id },
      select: { filename: true, mime: true },
    })
    await prisma.document.update({
      where: { id: target.id },
      data: {
        storagePath: key,
        sha256,
        filename: doc.filename ?? file.name,
        mime: doc.mime ?? file.mime,
      },
    })
    return {
      ok: true,
      documentId: target.id,
      matched: same ? 'sha256' : 'document',
    }
  }

  const saved = await saveDocument(prisma, {
    ownerId,
    houseId,
    type,
    title: file.name,
    filename: file.name,
    mime: file.mime,
    sha256,
    source: 'USER',
    storagePath: key,
  })
  if (!saved.ok) return { ok: false, status: 409, error: 'other_house' }
  return { ok: true, documentId: saved.documentId, matched: 'new' }
}
