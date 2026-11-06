// Stores a document's text, metadata and Claude's interpretation unchanged
// (CLAUDE.md, "Spara originalet"). A document is evidence, not a claim about
// the house, so its changeset is approved directly. The original file is
// uploaded through the web and matched by sha256.
import type {
  DocumentType,
  Prisma,
  PrismaClient,
  ValueSource,
} from '@prisma/client'
import { documentQuotaProblem } from '@/server/users/quota'

// The tool's schema limits fullText; an interpretation can be any JSON, so its
// size is checked here. Far more than a reading of any real document needs.
export const MAX_INTERPRETATION_CHARS = 500_000

export type SaveDocumentInput = {
  houseId: string
  // An existing document of the house to fill in, when it was saved
  // without text or file details and has no sha256 or sourceUrl to match.
  documentId?: string
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
  // Who saved it: Claude through MCP, or the user uploading a file.
  source?: ValueSource
  storagePath?: string
  sizeBytes?: number
}

export type SaveDocumentResult =
  | {
      ok: true
      documentId: string
      alreadySaved: boolean
      // What a repeated call filled in on a document saved without it.
      filled: string[]
    }
  | { ok: false; error: string }

// The fields of a stored document a later call may fill in where they are
// null: a document saved with its interpretation but without its text (as
// happened when houses were re-created through MCP) gets the text back
// under the same id. Nothing stored is replaced.
export const FILLABLE = [
  'title',
  'filename',
  'mime',
  'fullText',
  'interpretation',
  'documentDate',
  'amountSek',
] as const
export type Fillable = (typeof FILLABLE)[number]

export function backfill(
  existing: Partial<Record<Fillable, unknown>>,
  incoming: Partial<Record<Fillable, unknown>>
): Fillable[] {
  return FILLABLE.filter(
    (k) =>
      (existing[k] === null || existing[k] === undefined) &&
      incoming[k] !== undefined &&
      incoming[k] !== null &&
      incoming[k] !== ''
  )
}

export async function saveDocument(
  prisma: PrismaClient,
  { ownerId, ...doc }: SaveDocumentInput & { ownerId: string }
): Promise<SaveDocumentResult> {
  const house = await prisma.house.findFirst({
    where: { id: doc.houseId, ownerId },
    select: { id: true },
  })
  if (!house) return { ok: false, error: `No house with id ${doc.houseId}.` }

  const interpretationChars =
    doc.interpretation === undefined
      ? 0
      : JSON.stringify(doc.interpretation).length
  if (interpretationChars > MAX_INTERPRETATION_CHARS)
    return {
      ok: false,
      error: `The interpretation is too long: at most ${MAX_INTERPRETATION_CHARS} characters.`,
    }

  // Saving the same listing or file again returns the first copy, so a
  // repeated call cannot fork the evidence.
  if (doc.documentId) {
    const byId = await prisma.document.findFirst({
      where: { id: doc.documentId },
      select: { id: true, houseId: true },
    })
    if (!byId || byId.houseId !== doc.houseId)
      return {
        ok: false,
        error: `No document ${doc.documentId} for this house.`,
      }
  }
  const same = await prisma.document.findFirst({
    where: {
      OR: [
        ...(doc.documentId ? [{ id: doc.documentId }] : []),
        // This owner's houses only: another person's copy of the same file is
        // theirs, and whether one exists is none of this user's business.
        ...(doc.sha256 ? [{ sha256: doc.sha256, house: { ownerId } }] : []),
        ...(doc.sourceUrl
          ? [{ houseId: doc.houseId, type: doc.type, sourceUrl: doc.sourceUrl }]
          : []),
      ],
    },
    select: {
      id: true,
      houseId: true,
      title: true,
      filename: true,
      mime: true,
      fullText: true,
      interpretation: true,
      documentDate: true,
      amountSek: true,
    },
  })
  if (same) {
    if (same.houseId !== doc.houseId)
      return {
        ok: false,
        error: 'A document with this sha256 belongs to another house.',
      }
    const filled = backfill(same, doc)
    const fillsText = filled.includes('fullText')
    const fillsInterpretation = filled.includes('interpretation')
    if (fillsText || fillsInterpretation) {
      const problem = await documentQuotaProblem(prisma, ownerId, {
        isNew: false,
        addedChars:
          (fillsText ? (doc.fullText?.length ?? 0) : 0) +
          (fillsInterpretation ? interpretationChars : 0),
      })
      if (problem) return { ok: false, error: problem }
    }
    if (filled.length)
      await prisma.document.update({
        where: { id: same.id },
        data: Object.fromEntries(
          filled.map((k) => [
            k,
            k === 'documentDate' ? new Date(doc.documentDate!) : doc[k],
          ])
        ),
      })
    return { ok: true, documentId: same.id, alreadySaved: true, filled }
  }

  const problem = await documentQuotaProblem(prisma, ownerId, {
    isNew: true,
    addedChars: (doc.fullText?.length ?? 0) + interpretationChars,
  })
  if (problem) return { ok: false, error: problem }

  const created = await prisma.$transaction(async (tx) => {
    const changeset = await tx.changeset.create({
      data: {
        houseId: doc.houseId,
        source: doc.source ?? 'CLAUDE',
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
        storagePath: doc.storagePath ?? null,
        sizeBytes: doc.sizeBytes ?? null,
        changesetId: changeset.id,
      },
      select: { id: true },
    })
  })
  return { ok: true, documentId: created.id, alreadySaved: false, filled: [] }
}
