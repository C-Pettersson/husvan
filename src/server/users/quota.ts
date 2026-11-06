// What one account may store. Cloudflare only sees anonymous traffic: Claude's
// calls all come from Anthropic's range and a signed-in browser looks like any
// other, so these limits have to live here. Each function returns the reason
// for a refusal, written for Claude to pass on, or null. A count is checked
// before the write, so one call may go slightly over; the request size bounds
// by how much. Administrators have no limits.
import type { PrismaClient } from '@prisma/client'

export const QUOTAS = {
  houses: 20,
  documents: 200,
  fileBytes: 1024 * 1024 * 1024,
  documentChars: 20_000_000,
  observations: 50_000,
  forecastsPerHouse: 100,
}

const refusal = (what: string) =>
  `Account limit reached: ${what}. Nothing was written. Tell the user the account is full.`

async function isExempt(prisma: PrismaClient, ownerId: string) {
  const user = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { role: true },
  })
  return user?.role === 'ADMIN'
}

export async function houseQuotaProblem(
  prisma: PrismaClient,
  ownerId: string
): Promise<string | null> {
  if (await isExempt(prisma, ownerId)) return null
  const houses = await prisma.house.count({ where: { ownerId } })
  return houses >= QUOTAS.houses
    ? refusal(`at most ${QUOTAS.houses} houses`)
    : null
}

export async function documentQuotaProblem(
  prisma: PrismaClient,
  ownerId: string,
  { isNew, addedChars }: { isNew: boolean; addedChars: number }
): Promise<string | null> {
  if (await isExempt(prisma, ownerId)) return null
  if (isNew) {
    const documents = await prisma.document.count({
      where: { house: { ownerId } },
    })
    if (documents >= QUOTAS.documents)
      return refusal(`at most ${QUOTAS.documents} documents`)
  }
  if (addedChars === 0) return null
  const [{ chars }] = await prisma.$queryRaw<[{ chars: bigint }]>`
    SELECT COALESCE(SUM(
      COALESCE(LENGTH(d."fullText"), 0) +
      COALESCE(LENGTH(d."interpretation"::text), 0)
    ), 0)::bigint AS chars
    FROM "Document" d
    JOIN "House" h ON h."id" = d."houseId"
    WHERE h."ownerId" = ${ownerId}`
  return Number(chars) + addedChars > QUOTAS.documentChars
    ? refusal(`at most ${QUOTAS.documentChars} characters of document text`)
    : null
}

export async function fileQuotaProblem(
  prisma: PrismaClient,
  ownerId: string,
  { addedBytes }: { addedBytes: number }
): Promise<string | null> {
  if (await isExempt(prisma, ownerId)) return null
  const stored = await prisma.document.aggregate({
    where: { house: { ownerId } },
    _sum: { sizeBytes: true },
  })
  return (stored._sum.sizeBytes ?? 0) + addedBytes > QUOTAS.fileBytes
    ? refusal('at most 1 GB of files')
    : null
}

// A forecast past the limit is still answered, just not kept (saved: false).
export async function mayKeepForecast(
  prisma: PrismaClient,
  ownerId: string,
  houseId: string
): Promise<boolean> {
  if (await isExempt(prisma, ownerId)) return true
  const kept = await prisma.forecast.count({ where: { houseId } })
  return kept < QUOTAS.forecastsPerHouse
}

export async function observationQuotaProblem(
  prisma: PrismaClient,
  ownerId: string
): Promise<string | null> {
  if (await isExempt(prisma, ownerId)) return null
  const observations = await prisma.observation.count({
    where: { house: { ownerId } },
  })
  return observations >= QUOTAS.observations
    ? refusal(`at most ${QUOTAS.observations} stored values`)
    : null
}
