// What the listing says now (CLAUDE.md, "Skrivflöde"): sale status, asking
// price, highest bid and final price from a scheduled watch, approved at
// once with source IMPORT. They are figures read off the listing, not a
// reading of the house that needs review, and the latest observation per
// key is the current one (currentValue.ts, LATEST_WINS_KEYS), so a new
// bid is a new row and nothing is edited. A value equal to the current one
// is not written again, so a daily watch leaves no duplicate rows. The
// house status is a core field and changes in place, as on the web.
import { z } from 'zod'
import type { HouseStatus, PrismaClient } from '@prisma/client'
import { HOUSE_KEYS } from '@/server/library/houseKeys'
import { validateChanges, type ValueInput } from './changes'
import { currentValues } from './currentValue'
import { insertChanges, loadLibrary } from './proposeChanges'

const saleStatus = HOUSE_KEYS.sale_status.options as [string, ...string[]]

export const listingShape = {
  sale_status: z
    .enum(saleStatus)
    .optional()
    .describe('upcoming before bidding opens, bidding, closed when sold.'),
  asking_price_sek: z.number().positive().optional(),
  highest_bid_sek: z.number().positive().optional(),
  final_price_sek: z.number().positive().optional(),
}
export const listingValues = z.object(listingShape)
export type ListingValues = z.infer<typeof listingValues>

export const HOUSE_STATUSES = [
  'CANDIDATE',
  'DECLINED',
  'PURCHASED',
  'SOLD',
] as const satisfies readonly HouseStatus[]

export type ListingUpdateResult =
  | {
      ok: true
      // null when every value was already current.
      changesetId: string | null
      written: string[]
      unchanged: string[]
      status: HouseStatus
    }
  | { ok: false; errors: string[] }

// The values that differ from the current ones, as rows to write.
export function listingRows(
  values: ListingValues,
  current: ReadonlyMap<string, unknown>
): { rows: ValueInput[]; unchanged: string[] } {
  const rows: ValueInput[] = []
  const unchanged: string[] = []
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue
    if (current.get(key) === value) unchanged.push(key)
    else rows.push({ key, value, confidence: 1 })
  }
  return { rows, unchanged }
}

export async function updateListing(
  prisma: PrismaClient,
  {
    ownerId,
    houseId,
    values,
    status,
    comment,
  }: {
    ownerId: string
    houseId: string
    values: ListingValues
    status?: HouseStatus
    comment?: string
  }
): Promise<ListingUpdateResult> {
  const house = await prisma.house.findFirst({
    where: { id: houseId, ownerId },
    select: { id: true, status: true },
  })
  if (!house) return { ok: false, errors: [`No house with id ${houseId}.`] }

  const keys = Object.keys(values).filter(
    (k) => values[k as keyof ListingValues] !== undefined
  )
  if (!keys.length && !status)
    return { ok: false, errors: ['Nothing to update.'] }

  const observations = keys.length
    ? await prisma.observation.findMany({
        where: {
          houseId,
          componentId: null,
          key: { in: keys },
          retractedAt: null,
          changeset: { status: 'APPROVED' },
        },
        select: {
          key: true,
          value: true,
          source: true,
          confidence: true,
          recordedAt: true,
        },
      })
    : []
  const current = new Map(
    [
      ...currentValues(
        observations.map((o) => ({
          ...o,
          confidence: o.confidence === null ? null : Number(o.confidence),
        }))
      ),
    ].map(([key, v]) => [key, v.current.value])
  )
  const { rows, unchanged } = listingRows(values, current)

  const types = await loadLibrary(prisma)
  const input = {
    houseValues: rows,
    components: [],
    componentValues: [],
    workItems: [],
  }
  const { errors } = validateChanges(input, {
    types,
    components: new Map(),
    replaced: new Set(),
    documents: new Set(),
    workItems: new Map(),
    replacedWorkItems: new Set(),
    pendingReplacements: new Map(),
  })
  if (errors.length) return { ok: false, errors }

  const changesetId = await prisma.$transaction(async (tx) => {
    let id: string | null = null
    if (rows.length) {
      const changeset = await tx.changeset.create({
        data: {
          houseId,
          source: 'IMPORT',
          status: 'APPROVED',
          decidedAt: new Date(),
          comment: comment ?? null,
        },
      })
      await insertChanges(tx, {
        houseId,
        changesetId: changeset.id,
        source: 'IMPORT',
        input,
        types,
      })
      id = changeset.id
    }
    if (status && status !== house.status)
      await tx.house.update({ where: { id: houseId }, data: { status } })
    return id
  })
  return {
    ok: true,
    changesetId,
    written: rows.map((r) => r.key),
    unchanged,
    status: status ?? house.status,
  }
}
