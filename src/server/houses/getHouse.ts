// Everything about one house as its owner may see it: approved rows, plus the
// rows of one draft when the reader previews it. Drafts are real rows
// (CLAUDE.md, "Utkast är riktiga rader"), so a preview reads the same tables
// and marks what comes from the draft. Corrections and retirements
// (CLAUDE.md, "Rättningar") are rows too: a correcting component stands for
// the one it corrects, and a retired value is hidden once its changeset is
// approved.
import type {
  DocumentType,
  Prisma,
  PrismaClient,
  ValueSource,
  WorkItemKind,
} from '@prisma/client'
import { resolveChains } from './componentChain'
import { currentValues } from './currentValue'

export type Label = { sv: string; en?: string }

export type ValueRow = {
  id: string
  key: string
  value: Prisma.JsonValue
  unit: string | null
  source: ValueSource
  confidence: number | null
  quote: string | null
  documentId: string | null
  recordedAt: Date
  draft: boolean
}

export type KeyValueView = {
  key: string
  current: ValueRow
  alternatives: ValueRow[]
}

// The row a correction replaces in the reading, for showing before and
// after; parentId is the id of the old parent as stored.
export type CorrectedRow = {
  id: string
  type: string
  name: string | null
  parentId: string | null
}

export type ComponentView = {
  id: string
  type: string
  name: string | null
  draft: boolean
  // Where the part itself is documented, when it has no values of its own.
  documentId?: string | null
  quote?: string | null
  // Set when this row corrects an earlier registration of the part.
  corrects?: CorrectedRow
  values: KeyValueView[]
  children: ComponentView[]
}

// A value the previewed draft retires: shown with the draft so that the
// user sees what approving it hides.
export type RetirementView = {
  id: string
  observationId: string
  componentId: string | null
  key: string
  value: Prisma.JsonValue
  unit: string | null
  source: ValueSource
  reason: string | null
}

export type HouseView = Awaited<ReturnType<typeof getHouse>>

// With asOf, the house as it stood then (CLAUDE.md, "Huset ett visst
// datum"): changesets approved before the date, observations recorded
// before it, and what was retracted later still counts. A draft cannot be
// previewed in the past.
export async function getHouse(
  prisma: PrismaClient,
  {
    ownerId,
    houseId,
    draftId,
    asOf,
  }: { ownerId: string; houseId: string; draftId?: string; asOf?: Date }
) {
  const house = await prisma.house.findFirst({
    where: { id: houseId, ownerId },
    include: { municipality: { select: { code: true, name: true } } },
  })
  if (!house) return null

  const drafts = await prisma.changeset.findMany({
    where: { houseId, status: 'DRAFT' },
    orderBy: { createdAt: 'asc' },
    include: {
      _count: {
        select: {
          components: true,
          observations: true,
          workItems: true,
          retractions: true,
        },
      },
    },
  })
  const preview = asOf
    ? null
    : (drafts.find((d) => d.id === draftId)?.id ?? null)
  const approved: Prisma.ChangesetWhereInput = asOf
    ? { status: 'APPROVED', decidedAt: { lt: asOf } }
    : { status: 'APPROVED' }
  const visible: Prisma.ChangesetWhereInput = preview
    ? { OR: [approved, { id: preview }] }
    : approved
  const notRetracted = asOf
    ? { OR: [{ retractedAt: null }, { retractedAt: { gte: asOf } }] }
    : { retractedAt: null }

  const [components, observations, workItems, documents, retractions] =
    await Promise.all([
      prisma.component.findMany({
        where: { houseId, changeset: visible },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.observation.findMany({
        where: {
          houseId,
          changeset: visible,
          ...notRetracted,
          ...(asOf && { recordedAt: { lt: asOf } }),
        },
        orderBy: { recordedAt: 'asc' },
      }),
      prisma.workItem.findMany({
        where: { houseId, changeset: visible, ...notRetracted },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.document.findMany({
        where: { houseId, changeset: visible },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          title: true,
          sourceUrl: true,
          filename: true,
          documentDate: true,
          storagePath: true,
          changesetId: true,
        },
      }),
      prisma.retraction.findMany({
        where: { houseId, changeset: visible },
        select: {
          id: true,
          observationId: true,
          reason: true,
          changesetId: true,
        },
      }),
    ])

  // Values retired by an approved changeset are hidden; those the previewed
  // draft retires are hidden from the values and listed on their own.
  const retiredApproved = new Set(
    retractions
      .filter((r) => r.changesetId !== preview)
      .map((r) => r.observationId)
  )
  const retiredInDraft = new Map(
    retractions
      .filter((r) => r.changesetId === preview)
      .map((r) => [r.observationId, r])
  )
  const shown = observations.filter(
    (o) => !retiredApproved.has(o.id) && !retiredInDraft.has(o.id)
  )

  const types = await prisma.componentType.findMany({
    where: { type: { in: [...new Set(components.map((c) => c.type))] } },
    select: { type: true, label: true, category: true, attributeSchema: true },
  })

  const toRow = (o: (typeof observations)[number]): ValueRow => ({
    id: o.id,
    key: o.key,
    value: o.value,
    unit: o.unit,
    source: o.source,
    confidence: o.confidence === null ? null : Number(o.confidence),
    quote: o.quote,
    documentId: o.documentId,
    recordedAt: o.recordedAt,
    draft: o.changesetId === preview,
  })

  // A correcting row stands for the rows it corrects: their values and
  // children are read as the newest row's.
  const { heads, headOf, chainOf } = resolveChains(components)
  const byId = new Map(components.map((c) => [c.id, c]))
  const valuesOf = (ids: (string | null)[]): KeyValueView[] => {
    const own = new Set(ids)
    return [
      ...currentValues(shown.filter((o) => own.has(o.componentId)).map(toRow)),
    ].map(([key, v]) => ({ key, ...v }))
  }

  // A work item another visible one restates is history.
  const restated = new Set(workItems.map((w) => w.replacesId).filter(Boolean))
  const currentWorkItems = workItems.filter((w) => !restated.has(w.id))

  const build = (parentHead: string | null): ComponentView[] =>
    heads
      .filter(
        (c) =>
          (c.parentId === null ? null : (headOf.get(c.parentId) ?? false)) ===
          parentHead
      )
      .map((c) => {
        const chain = chainOf.get(c.id) ?? [c]
        const old = c.correctsId ? byId.get(c.correctsId) : undefined
        return {
          id: c.id,
          type: c.type,
          name: c.name,
          draft: c.changesetId === preview,
          documentId: c.documentId,
          quote: c.quote,
          corrects: old && {
            id: old.id,
            type: old.type,
            name: old.name,
            parentId: old.parentId,
          },
          values: valuesOf(chain.map((r) => r.id)),
          children: build(c.id),
        }
      })

  const retirements: RetirementView[] = observations
    .filter((o) => retiredInDraft.has(o.id))
    .map((o) => ({
      id: retiredInDraft.get(o.id)!.id,
      observationId: o.id,
      componentId:
        o.componentId === null
          ? null
          : (headOf.get(o.componentId) ?? o.componentId),
      key: o.key,
      value: o.value,
      unit: o.unit,
      source: o.source,
      reason: retiredInDraft.get(o.id)!.reason,
    }))

  return {
    id: house.id,
    address: house.address,
    propertyDesignation: house.propertyDesignation,
    status: house.status,
    municipality: house.municipality,
    values: valuesOf([null]),
    components: build(null),
    types: Object.fromEntries(
      types.map((t) => [
        t.type,
        {
          label: t.label as Label,
          category: t.category,
          attributeSchema: t.attributeSchema as Record<
            string,
            {
              label: Label
              datatype: string
              unit?: string
              options?: Record<string, Label>
            }
          >,
        },
      ])
    ),
    workItems: currentWorkItems.map((w) => ({
      id: w.id,
      replacesId: w.replacesId,
      // A work item on a corrected row belongs to the row that stands for
      // the part now.
      componentId:
        w.componentId === null
          ? null
          : (headOf.get(w.componentId) ?? w.componentId),
      kind: w.kind as WorkItemKind,
      severity: w.severity,
      confidence: w.confidence === null ? null : Number(w.confidence),
      description: w.description,
      yearMin: w.yearMin,
      yearMax: w.yearMax,
      costLowSek: w.costLowSek === null ? null : Number(w.costLowSek),
      costHighSek: w.costHighSek === null ? null : Number(w.costHighSek),
      quote: w.quote,
      documentId: w.documentId,
      draft: w.changesetId === preview,
    })),
    documents: documents.map((d) => ({
      id: d.id,
      type: d.type as DocumentType,
      title: d.title,
      sourceUrl: d.sourceUrl,
      filename: d.filename,
      documentDate: d.documentDate,
      // The original file is uploaded and can be opened.
      hasFile: d.storagePath !== null,
    })),
    // What the previewed draft retires; empty without a preview.
    retirements,
    drafts: drafts.map((d) => ({
      id: d.id,
      comment: d.comment,
      createdAt: d.createdAt,
      counts: d._count,
    })),
    preview,
    asOf: asOf ?? null,
  }
}
