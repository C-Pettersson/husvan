import type { AreaLevel, PrismaClient } from '@prisma/client'

export type AreaStatisticRow = {
  areaLevel: AreaLevel
  areaCode: string
  key: string
  year: number
  value: number
  unit: string
  source: string
  sourceUrl: string
}

// Upserts on (level, code, key, year); a newer import of the same figure
// replaces the value.
export async function upsertAreaStatistics(
  prisma: PrismaClient,
  rows: AreaStatisticRow[]
) {
  for (const { areaLevel, areaCode, key, year, ...rest } of rows) {
    const id = { areaLevel, areaCode, key, year }
    await prisma.areaStatistic.upsert({
      where: { areaLevel_areaCode_key_year: id },
      update: { ...rest, importedAt: new Date() },
      create: { ...id, ...rest },
    })
  }
}

// Prints how many rows each key got per level, as a check after an import.
export function summarize(rows: AreaStatisticRow[]) {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const k = `${r.key} ${r.areaLevel}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  for (const [k, n] of [...counts].sort()) console.log(`  ${k}: ${n}`)
}
