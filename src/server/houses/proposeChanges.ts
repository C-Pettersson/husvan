// Writes a draft: new components, observations and work items in a DRAFT
// changeset, invisible until the user approves it (CLAUDE.md, "Utkast är
// riktiga rader"). Everything is validated first and nothing is written if
// anything is wrong.
import type { Prisma, PrismaClient, ValueSource } from '@prisma/client'
import { HOUSE_KEYS } from '@/server/library/houseKeys'
import type { AttributeDefinition } from '@/server/library/schema'
import {
  validateChanges,
  type ChangeContext,
  type ChangesInput,
  type Problems,
  type ValueInput,
} from './changes'

type Db = PrismaClient | Prisma.TransactionClient

export async function loadLibrary(db: Db): Promise<ChangeContext['types']> {
  const types = await db.componentType.findMany({
    select: { type: true, attributeSchema: true, allowedSubcomponents: true },
  })
  return new Map(
    types.map((t) => [
      t.type,
      {
        attributeSchema: t.attributeSchema as Record<
          string,
          AttributeDefinition
        >,
        allowedSubcomponents: t.allowedSubcomponents,
      },
    ])
  )
}

// What the draft may point at: approved components and documents, plus the
// components of the draft it is added to.
export async function loadContext(
  db: Db,
  houseId: string,
  draftId?: string
): Promise<ChangeContext> {
  const visible: Prisma.ChangesetWhereInput = draftId
    ? { OR: [{ status: 'APPROVED' }, { id: draftId }] }
    : { status: 'APPROVED' }
  const otherDrafts: Prisma.ChangesetWhereInput = {
    status: 'DRAFT',
    ...(draftId && { id: { not: draftId } }),
  }
  const [types, components, documents, workItems, pending] = await Promise.all([
    loadLibrary(db),
    db.component.findMany({
      where: { houseId, changeset: visible },
      select: { id: true, type: true, replacesId: true },
    }),
    db.document.findMany({
      where: { houseId, changeset: { status: 'APPROVED' } },
      select: { id: true },
    }),
    db.workItem.findMany({
      where: { houseId, changeset: visible, retractedAt: null },
      select: { id: true, componentId: true, replacesId: true },
    }),
    Promise.all([
      db.component.findMany({
        where: { houseId, changeset: otherDrafts, replacesId: { not: null } },
        select: { replacesId: true, changesetId: true },
      }),
      db.workItem.findMany({
        where: { houseId, changeset: otherDrafts, replacesId: { not: null } },
        select: { replacesId: true, changesetId: true },
      }),
    ]),
  ])
  const replacedWorkItems = new Set(
    workItems.flatMap((w) => (w.replacesId ? [w.replacesId] : []))
  )
  const replaced = new Set(
    components.flatMap((c) => (c.replacesId ? [c.replacesId] : []))
  )
  return {
    types,
    components: new Map(
      components.filter((c) => !replaced.has(c.id)).map((c) => [c.id, c.type])
    ),
    replaced,
    documents: new Set(documents.map((d) => d.id)),
    workItems: new Map(
      workItems
        .filter((w) => !replacedWorkItems.has(w.id))
        .map((w) => [w.id, w.componentId])
    ),
    replacedWorkItems,
    pendingReplacements: new Map(
      pending.flat().map((r) => [r.replacesId!, r.changesetId])
    ),
  }
}

export type Written = {
  draftId: string
  // Ids of the new components by the ref Claude gave them.
  components: Record<string, string>
  counts: { components: number; observations: number; workItems: number }
}

// Inserts validated changes into a changeset. Components go in the order
// given, so a parent ref always resolves to an id written before it.
export async function insertChanges(
  tx: Prisma.TransactionClient,
  {
    houseId,
    changesetId,
    source,
    input,
    types,
  }: {
    houseId: string
    changesetId: string
    source: ValueSource
    input: ChangesInput
    types: ChangeContext['types']
  }
): Promise<Written> {
  const ids: Record<string, string> = {}
  const target = (refOrId: string | undefined) =>
    refOrId ? (ids[refOrId] ?? refOrId) : null

  const rows = (
    componentId: string | null,
    type: string | null,
    values: ValueInput[]
  ): Prisma.ObservationCreateManyInput[] =>
    values.map((v) => {
      const def = type
        ? types.get(type)?.attributeSchema[v.key]
        : HOUSE_KEYS[v.key]
      const unit = def && 'unit' in def ? def.unit : undefined
      return {
        houseId,
        componentId,
        key: v.key,
        value: v.value,
        unit: v.unit ?? unit ?? null,
        source,
        documentId: v.documentId ?? null,
        confidence: v.confidence,
        quote: v.quote ?? null,
        changesetId,
      }
    })

  const observations = rows(null, null, input.houseValues)
  for (const c of input.components) {
    const row = await tx.component.create({
      data: {
        houseId,
        type: c.type,
        name: c.name ?? null,
        parentId: target(c.parent),
        replacesId: c.replaces ?? null,
        changesetId,
      },
    })
    ids[c.ref] = row.id
    observations.push(...rows(row.id, c.type, c.values))
  }
  if (input.componentValues.length) {
    const existing = await tx.component.findMany({
      where: { id: { in: input.componentValues.map((c) => c.componentId) } },
      select: { id: true, type: true },
    })
    const typeOf = new Map(existing.map((c) => [c.id, c.type]))
    for (const c of input.componentValues)
      observations.push(
        ...rows(c.componentId, typeOf.get(c.componentId) ?? null, c.values)
      )
  }
  await tx.observation.createMany({ data: observations })
  // A restated work item keeps the old one's component unless it names one.
  const restated = input.workItems.flatMap((w) =>
    w.replaces ? [w.replaces] : []
  )
  const componentOf = new Map(
    (restated.length
      ? await tx.workItem.findMany({
          where: { id: { in: restated } },
          select: { id: true, componentId: true },
        })
      : []
    ).map((w) => [w.id, w.componentId])
  )
  await tx.workItem.createMany({
    data: input.workItems.map((w) => ({
      houseId,
      componentId: w.component
        ? target(w.component)
        : w.replaces
          ? (componentOf.get(w.replaces) ?? null)
          : null,
      replacesId: w.replaces ?? null,
      kind: w.kind,
      description: w.description,
      yearMin: w.yearMin ?? null,
      yearMax: w.yearMax ?? null,
      costLowSek: w.costLowSek ?? null,
      costHighSek: w.costHighSek ?? null,
      source,
      documentId: w.documentId ?? null,
      quote: w.quote ?? null,
      changesetId,
    })),
  })
  return {
    draftId: changesetId,
    components: ids,
    counts: {
      components: input.components.length,
      observations: observations.length,
      workItems: input.workItems.length,
    },
  }
}

export type ProposeResult =
  ({ ok: true; warnings: string[] } & Written) | ({ ok: false } & Problems)

// A new draft, or more rows in an open draft of the same house.
export async function proposeChanges(
  prisma: PrismaClient,
  {
    ownerId,
    houseId,
    draftId,
    comment,
    source,
    input,
  }: {
    ownerId: string
    houseId: string
    draftId?: string
    comment?: string
    source: ValueSource
    input: ChangesInput
  }
): Promise<ProposeResult> {
  const house = await prisma.house.findFirst({
    where: { id: houseId, ownerId },
    select: { id: true },
  })
  if (!house)
    return { ok: false, errors: [`No house with id ${houseId}.`], warnings: [] }
  if (draftId) {
    const draft = await prisma.changeset.findFirst({
      where: { id: draftId, houseId, status: 'DRAFT' },
      select: { id: true },
    })
    if (!draft)
      return {
        ok: false,
        errors: [`No open draft ${draftId} for this house.`],
        warnings: [],
      }
  }

  const ctx = await loadContext(prisma, houseId, draftId)
  const { errors, warnings } = validateChanges(input, ctx)
  if (errors.length) return { ok: false, errors, warnings }

  const written = await prisma.$transaction(async (tx) => {
    if (draftId) {
      // Locks the draft row so that an approval cannot slip in between and
      // make these rows visible unreviewed.
      const { count } = await tx.changeset.updateMany({
        where: { id: draftId, status: 'DRAFT' },
        data: { status: 'DRAFT' },
      })
      if (count !== 1) return null
    }
    const changesetId =
      draftId ??
      (
        await tx.changeset.create({
          data: { houseId, source, comment: comment ?? null },
        })
      ).id
    return insertChanges(tx, {
      houseId,
      changesetId,
      source,
      input,
      types: ctx.types,
    })
  })
  if (!written)
    return {
      ok: false,
      errors: [`Draft ${draftId} was decided meanwhile; propose a new draft.`],
      warnings,
    }
  return { ok: true, warnings, ...written }
}
