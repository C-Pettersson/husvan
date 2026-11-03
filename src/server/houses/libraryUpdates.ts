// What the type library has gained since a house was last read (CLAUDE.md,
// "Nya typer för befintliga hus"). A house is read against the library of
// its day; when types are added later, its documents may mention parts that
// had no type then: a WC recorded as a bathroom, gutters not recorded at all.
// The server lists the new types and what the house already has of the same
// kind; Claude re-reads the documents and proposes what they say, and marks
// the review when there is nothing to add, so the list starts over.
import type { PrismaClient } from '@prisma/client'
import { forecastDefaultsSchema } from '@/server/library/schema'
import { flatten, valueOf } from './derive'
import type { ComponentView, KeyValueView, Label } from './getHouse'

export type TypeRow = {
  type: string
  label: Label
  category: string
  attributeSchema: unknown
  forecastDefaults: unknown
  createdAt: Date
}

export type LibraryUpdate = {
  type: string
  label: Label
  category: string
  addedAt: Date
  attributes: string[]
  // The type has a lifespan profile, so a documented part changes the cost.
  hasProfile: boolean
  // The forecast already assumes one from the construction year; a
  // documented part replaces the assumption.
  assumedUndocumented: boolean
  // Parts the house has in the same category, which the new type may
  // describe better (a bathroom that is a WC).
  related: { id: string; type: string; name: string | null }[]
}

// When the house was last read against the library: the latest approved
// changeset from Claude (a draft approved, or a review marked), else when
// the house was created.
export type ReadAt = { at: Date; reason: 'review' | 'changeset' | 'created' }

export type LibraryUpdates = { readAt: ReadAt; types: LibraryUpdate[] }

export const REVIEW_COMMENT = 'Library review'

// Pure: the types added after `since` that the house neither has nor says
// it lacks, oldest first.
export function newTypesSince(
  types: TypeRow[],
  since: Date,
  components: ComponentView[],
  houseValues: KeyValueView[],
  profiledTypes: ReadonlySet<string>
): LibraryUpdate[] {
  const parts = flatten(components)
  const have = new Set(parts.map((c) => c.type))
  const absentValue = valueOf(houseValues, 'absent_features')
  const absent = new Set(
    Array.isArray(absentValue)
      ? absentValue.filter((s): s is string => typeof s === 'string')
      : []
  )
  const categoryOf = new Map(types.map((t) => [t.type, t.category]))
  return types
    .filter(
      (t) => t.createdAt > since && !have.has(t.type) && !absent.has(t.type)
    )
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.type.localeCompare(b.type)
    )
    .map((t) => ({
      type: t.type,
      label: t.label,
      category: t.category,
      addedAt: t.createdAt,
      attributes: Object.keys(
        (t.attributeSchema as Record<string, unknown> | null) ?? {}
      ),
      hasProfile: profiledTypes.has(t.type),
      assumedUndocumented:
        forecastDefaultsSchema.safeParse(t.forecastDefaults).data
          ?.assumeUndocumented === true,
      related: parts
        .filter((c) => categoryOf.get(c.type) === t.category)
        .map((c) => ({ id: c.id, type: c.type, name: c.name })),
    }))
}

export async function readAt(
  prisma: PrismaClient,
  houseId: string
): Promise<ReadAt | null> {
  const house = await prisma.house.findUnique({
    where: { id: houseId },
    select: { createdAt: true },
  })
  if (!house) return null
  const last = await prisma.changeset.findFirst({
    where: {
      houseId,
      source: 'CLAUDE',
      status: 'APPROVED',
      decidedAt: { not: null },
    },
    orderBy: { decidedAt: 'desc' },
    select: { decidedAt: true, comment: true },
  })
  if (!last?.decidedAt) return { at: house.createdAt, reason: 'created' }
  return {
    at: last.decidedAt,
    reason: last.comment?.startsWith(REVIEW_COMMENT) ? 'review' : 'changeset',
  }
}

async function loadTypes(prisma: PrismaClient) {
  const [types, profiled] = await Promise.all([
    prisma.componentType.findMany({
      select: {
        type: true,
        label: true,
        category: true,
        attributeSchema: true,
        forecastDefaults: true,
        createdAt: true,
      },
    }),
    prisma.lifespanProfile.findMany({
      distinct: ['type'],
      select: { type: true },
    }),
  ])
  return {
    types: types.map((t) => ({ ...t, label: t.label as Label })),
    profiled: new Set(profiled.map((p) => p.type)),
  }
}

export type HouseForUpdates = {
  id: string
  components: ComponentView[]
  values: KeyValueView[]
}

// The updates for several houses with the library loaded once.
export async function libraryUpdatesFor(
  prisma: PrismaClient,
  houses: HouseForUpdates[]
): Promise<Map<string, LibraryUpdates>> {
  if (!houses.length) return new Map()
  const { types, profiled } = await loadTypes(prisma)
  const entries = await Promise.all(
    houses.map(async (h): Promise<[string, LibraryUpdates] | null> => {
      const read = await readAt(prisma, h.id)
      if (!read) return null
      return [
        h.id,
        {
          readAt: read,
          types: newTypesSince(
            types,
            read.at,
            h.components,
            h.values,
            profiled
          ),
        },
      ]
    })
  )
  return new Map(entries.filter((e): e is [string, LibraryUpdates] => !!e))
}

export async function libraryUpdates(
  prisma: PrismaClient,
  house: HouseForUpdates
): Promise<LibraryUpdates | null> {
  return (await libraryUpdatesFor(prisma, [house])).get(house.id) ?? null
}

// Records that the documents were read against the current library and
// nothing was added: an approved changeset from Claude without rows, so
// that the next list counts from now. A draft that is approved does the
// same by itself.
export async function markLibraryReview(
  prisma: PrismaClient,
  {
    ownerId,
    houseId,
    comment,
  }: { ownerId: string; houseId: string; comment?: string }
): Promise<
  | { ok: true; changesetId: string; reviewedAt: Date }
  | { ok: false; error: string }
> {
  const house = await prisma.house.findFirst({
    where: { id: houseId, ownerId },
    select: { id: true },
  })
  if (!house) return { ok: false, error: `No house with id ${houseId}.` }
  const now = new Date()
  const changeset = await prisma.changeset.create({
    data: {
      houseId,
      source: 'CLAUDE',
      status: 'APPROVED',
      decidedAt: now,
      comment: comment ? `${REVIEW_COMMENT}: ${comment}` : REVIEW_COMMENT,
    },
    select: { id: true },
  })
  return { ok: true, changesetId: changeset.id, reviewedAt: now }
}
