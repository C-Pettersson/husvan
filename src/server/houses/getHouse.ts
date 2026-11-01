// Everything about one house as its owner may see it: approved rows, plus the
// rows of one draft when the reader previews it. Drafts are real rows
// (CLAUDE.md, "Utkast är riktiga rader"), so a preview reads the same tables
// and marks what comes from the draft.
import type {
  DocumentType,
  Prisma,
  PrismaClient,
  ValueSource,
  WorkItemKind,
} from '@prisma/client'
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

export type ComponentView = {
  id: string
  type: string
  name: string | null
  draft: boolean
  values: KeyValueView[]
  children: ComponentView[]
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
        select: { components: true, observations: true, workItems: true },
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

  const [components, observations, workItems, documents] = await Promise.all([
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
        changesetId: true,
      },
    }),
  ])

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
  const valuesOf = (componentId: string | null): KeyValueView[] =>
    [
      ...currentValues(
        observations.filter((o) => o.componentId === componentId).map(toRow)
      ),
    ].map(([key, v]) => ({ key, ...v }))

  // A work item another visible one restates is history.
  const restated = new Set(workItems.map((w) => w.replacesId).filter(Boolean))
  const currentWorkItems = workItems.filter((w) => !restated.has(w.id))

  // A component another visible component replaces is history, not part of
  // the house as it stands.
  const replaced = new Set(components.map((c) => c.replacesId).filter(Boolean))
  const current = components.filter((c) => !replaced.has(c.id))
  const build = (parentId: string | null): ComponentView[] =>
    current
      .filter((c) => c.parentId === parentId)
      .map((c) => ({
        id: c.id,
        type: c.type,
        name: c.name,
        draft: c.changesetId === preview,
        values: valuesOf(c.id),
        children: build(c.id),
      }))

  return {
    id: house.id,
    address: house.address,
    propertyDesignation: house.propertyDesignation,
    status: house.status,
    municipality: house.municipality,
    values: valuesOf(null),
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
      componentId: w.componentId,
      kind: w.kind as WorkItemKind,
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
    })),
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
