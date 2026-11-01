// Stores a document's text, metadata and Claude's interpretation unchanged
// (CLAUDE.md, "Spara originalet"). A document is evidence, not a claim about
// the house, so its changeset is approved directly. The original file is
// uploaded through the web and matched by sha256.
import type { DocumentType, Prisma, PrismaClient } from '@prisma/client'

export type SaveDocumentInput = {
  houseId: string
  type: DocumentType
  title?: string
  sourceUrl?: string
  filename?: string
  mime?: string
  sha256?: string
  fullText?: string
  interpretation?: Prisma.InputJsonValue
  documentDate?: string
  amountSek?: number
}

export type SaveDocumentResult =
  | { ok: true; documentId: string; alreadySaved: boolean }
  | { ok: false; error: string }

export async function saveDocument(
  prisma: PrismaClient,
  { ownerId, ...doc }: SaveDocumentInput & { ownerId: string }
): Promise<SaveDocumentResult> {
  const house = await prisma.house.findFirst({
    where: { id: doc.houseId, ownerId },
    select: { id: true },
  })
  if (!house) return { ok: false, error: `No house with id ${doc.houseId}.` }

  // Saving the same listing or file again returns the first copy, so a
  // repeated call cannot fork the evidence.
  const same = await prisma.document.findFirst({
    where: {
      OR: [
        ...(doc.sha256 ? [{ sha256: doc.sha256 }] : []),
        ...(doc.sourceUrl
          ? [{ houseId: doc.houseId, type: doc.type, sourceUrl: doc.sourceUrl }]
          : []),
      ],
    },
    select: { id: true, houseId: true },
  })
  if (same) {
    if (same.houseId !== doc.houseId)
      return {
        ok: false,
        error: 'A document with this sha256 belongs to another house.',
      }
    return { ok: true, documentId: same.id, alreadySaved: true }
  }

  const created = await prisma.$transaction(async (tx) => {
    const changeset = await tx.changeset.create({
      data: {
        houseId: doc.houseId,
        source: 'CLAUDE',
        status: 'APPROVED',
        decidedAt: new Date(),
        comment: doc.title ?? doc.type,
      },
    })
    return tx.document.create({
      data: {
        houseId: doc.houseId,
        type: doc.type,
        title: doc.title ?? null,
        sourceUrl: doc.sourceUrl ?? null,
        filename: doc.filename ?? null,
        mime: doc.mime ?? null,
        sha256: doc.sha256 ?? null,
        fullText: doc.fullText ?? null,
        interpretation: doc.interpretation,
        documentDate: doc.documentDate ? new Date(doc.documentDate) : null,
        amountSek: doc.amountSek ?? null,
        changesetId: changeset.id,
      },
      select: { id: true },
    })
  })
  return { ok: true, documentId: created.id, alreadySaved: false }
}
