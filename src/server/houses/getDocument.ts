// One saved document with its text and Claude's interpretation, as stored
// (CLAUDE.md, "Spara originalet"), so a later chat can read it again without
// the user uploading it anew. The server returns what was saved; it does not
// extract text from the original file.
import type { DocumentType, Prisma, PrismaClient } from '@prisma/client'

export const DEFAULT_PAGE_CHARS = 40_000
export const MAX_PAGE_CHARS = 100_000

export type TextPage = {
  content: string
  offset: number
  totalLength: number
  // Where the next page starts, or null when this page reaches the end.
  nextOffset: number | null
}

// A slice of the text that never splits a surrogate pair, so a page ends on
// a whole character.
export function textPage(
  text: string,
  offset: number,
  maxChars: number
): TextPage {
  const start = Math.min(offset, text.length)
  let end = Math.min(start + maxChars, text.length)
  const last = text.charCodeAt(end - 1)
  if (end < text.length && end - 1 > start && last >= 0xd800 && last <= 0xdbff)
    end--
  return {
    content: text.slice(start, end),
    offset: start,
    totalLength: text.length,
    nextOffset: end < text.length ? end : null,
  }
}

export type DocumentView = {
  id: string
  houseId: string
  type: DocumentType
  title: string | null
  sourceUrl: string | null
  filename: string | null
  mime: string | null
  documentDate: Date | null
  amountSek: number | null
  hasFile: boolean
  fullText: string | null
  interpretation: Prisma.JsonValue
  createdAt: Date
}

export async function getDocument(
  prisma: PrismaClient,
  { ownerId, documentId }: { ownerId: string; documentId: string }
): Promise<DocumentView | null> {
  const d = await prisma.document.findFirst({
    where: {
      id: documentId,
      house: { ownerId },
      changeset: { status: 'APPROVED' },
    },
    select: {
      id: true,
      houseId: true,
      type: true,
      title: true,
      sourceUrl: true,
      filename: true,
      mime: true,
      documentDate: true,
      amountSek: true,
      storagePath: true,
      fullText: true,
      interpretation: true,
      createdAt: true,
    },
  })
  if (!d || !d.houseId) return null
  return {
    id: d.id,
    houseId: d.houseId,
    type: d.type,
    title: d.title,
    sourceUrl: d.sourceUrl,
    filename: d.filename,
    mime: d.mime,
    documentDate: d.documentDate,
    amountSek: d.amountSek === null ? null : Number(d.amountSek),
    hasFile: d.storagePath !== null,
    fullText: d.fullText,
    interpretation: d.interpretation,
    createdAt: d.createdAt,
  }
}
