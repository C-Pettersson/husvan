// The statistics for a house's areas, each beside the municipality's and the
// nation's (CLAUDE.md, "Området"). The latest year per key and level; the
// level always goes with the value, so a municipal figure is never read as
// the neighbourhood's.
import type { AreaLevel, PrismaClient } from '@prisma/client'
import { valueOf } from './derive'
import type { HouseView } from './getHouse'

export type AreaRef = { level: AreaLevel; code: string }

export async function areaStatistics(prisma: PrismaClient, areas: AreaRef[]) {
  const rows = await prisma.areaStatistic.findMany({
    where: {
      OR: areas.map((a) => ({ areaLevel: a.level, areaCode: a.code })),
    },
    orderBy: { year: 'desc' },
  })
  const latest = new Map<string, (typeof rows)[number]>()
  for (const r of rows) {
    const k = `${r.areaLevel}|${r.areaCode}|${r.key}`
    if (!latest.has(k)) latest.set(k, r)
  }
  return areas.map((a) => ({
    level: a.level,
    code: a.code,
    statistics: [...latest.values()]
      .filter((r) => r.areaLevel === a.level && r.areaCode === a.code)
      .sort((x, y) => x.key.localeCompare(y.key))
      .map((r) => ({
        key: r.key,
        year: r.year,
        value: Number(r.value),
        unit: r.unit,
        source: r.source,
      })),
  }))
}

// The areas a house belongs to, smallest first, always with the nation.
export function houseAreas(view: NonNullable<HouseView>): AreaRef[] {
  const areas: AreaRef[] = []
  const deso = valueOf(view.values, 'deso_code')
  if (typeof deso === 'string') areas.push({ level: 'DESO', code: deso })
  const police = valueOf(view.values, 'police_area_code')
  if (typeof police === 'string')
    areas.push({ level: 'POLICE_AREA', code: police })
  if (view.municipality)
    areas.push({ level: 'MUNICIPALITY', code: view.municipality.code })
  areas.push({ level: 'NATION', code: 'SE' })
  return areas
}
