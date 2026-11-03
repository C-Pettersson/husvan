// External ids of a listing (booli_id, listing_id in houseKeys.ts), so that
// a scheduled watch finds the house it saw before instead of creating it
// again: list_houses filters on them and create_house treats a shared id as
// the same house. Ids in open drafts count too, since the id Claude gave
// create_house sits in a draft until the user approves it.
import type { Prisma, PrismaClient } from '@prisma/client'

export const EXTERNAL_ID_KEYS = ['booli_id', 'listing_id'] as const

// "  12345 " and "12345" are the same id; so are "ABC-1" and "abc-1".
export const normalizeExternalId = (id: string) => id.trim().toLowerCase()

export const matchesExternalId = (ids: readonly string[], externalId: string) =>
  ids.some((id) => normalizeExternalId(id) === normalizeExternalId(externalId))

// The external ids among a set of values, as strings.
export function externalIdsOf(
  values: readonly { key: string; value: unknown }[]
): string[] {
  return values
    .filter(
      (v) =>
        (EXTERNAL_ID_KEYS as readonly string[]).includes(v.key) &&
        (typeof v.value === 'string' || typeof v.value === 'number') &&
        String(v.value).trim() !== ''
    )
    .map((v) => String(v.value))
}

// External ids per house for one owner, from observations that are not
// retracted and not rejected.
export async function loadExternalIds(
  db: PrismaClient | Prisma.TransactionClient,
  ownerId: string
): Promise<Map<string, string[]>> {
  const rows = await db.observation.findMany({
    where: {
      house: { ownerId },
      componentId: null,
      key: { in: [...EXTERNAL_ID_KEYS] },
      retractedAt: null,
      changeset: { status: { in: ['DRAFT', 'APPROVED'] } },
    },
    select: { houseId: true, key: true, value: true },
  })
  const map = new Map<string, string[]>()
  for (const r of rows) {
    const ids = map.get(r.houseId) ?? []
    ids.push(...externalIdsOf([r]))
    map.set(r.houseId, ids)
  }
  return map
}
