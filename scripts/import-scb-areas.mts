// `yarn import:scb`: who lives in the area, per DeSO in Luleå and Boden, with
// the municipality and the nation for comparison (CLAUDE.md, "Området").
//
// DeSO 2025 codes, which have data from 2024. A house's deso_code is the
// DeSO 2025 code without suffix, e.g. 2580C1140. Run when SCB publishes:
// population in March, economic standard around January, education in spring.
import { PrismaClient, type AreaLevel } from '@prisma/client'
import { fetchTable, fetchValueCodes, type Row } from './lib/scb.mts'
import {
  summarize,
  upsertAreaStatistics,
  type AreaStatisticRow,
} from './lib/areaStatistics.mts'

const MUNICIPALITIES = ['2580', '2582']
const FROM_YEAR = '2024'
const DESO_SUFFIX = '_DeSO2025'
const tableUrl = (id: string) =>
  `https://statistikdatabasen.scb.se/api/v2/tables/${id}/metadata?lang=sv`

const prisma = new PrismaClient()

function area(region: string): { areaLevel: AreaLevel; areaCode: string } {
  if (region === '00') return { areaLevel: 'NATION', areaCode: 'SE' }
  if (region.endsWith(DESO_SUFFIX)) {
    return { areaLevel: 'DESO', areaCode: region.slice(0, -DESO_SUFFIX.length) }
  }
  return { areaLevel: 'MUNICIPALITY', areaCode: region }
}

// Groups rows by region and year so a statistic can be computed from several
// cells (e.g. a share from a count and a total).
function byRegionYear(rows: Row[], dim: string) {
  const groups = new Map<
    string,
    { region: string; year: number; cells: Record<string, number | null> }
  >()
  for (const r of rows) {
    const k = `${r.Region}|${r.Tid}`
    const g = groups.get(k) ?? {
      region: r.Region,
      year: Number(r.Tid),
      cells: {},
    }
    g.cells[r[dim]] = r.value
    groups.set(k, g)
  }
  return [...groups.values()]
}

async function main() {
  const allRegions = await fetchValueCodes('TAB6574', 'Region')
  // The letter after the municipality code is A (mostly rural), B (smaller
  // towns) or C (mostly urban).
  const deso = allRegions.filter((r) =>
    MUNICIPALITIES.some((m) =>
      new RegExp(`^${m}[ABC]\\d{4}${DESO_SUFFIX}$`).test(r)
    )
  )
  const regions = ['00', ...MUNICIPALITIES, ...deso]
  console.log(`${deso.length} DeSO areas in ${MUNICIPALITIES.join(', ')}`)

  const out: AreaStatisticRow[] = []
  const push = (
    region: string,
    year: number,
    key: string,
    value: number | null,
    unit: string,
    tableId: string
  ) => {
    if (value === null || !Number.isFinite(value)) return
    out.push({
      ...area(region),
      key,
      year,
      value,
      unit,
      source: 'scb',
      sourceUrl: tableUrl(tableId),
    })
  }

  // Population by age, 31 December.
  const ages = ['-4', '5-9', '10-14', '15-19', '65-69', '70-74', '75-79', '80-']
  const population = await fetchTable('TAB6574', {
    Region: regions,
    Alder: ['totalt', ...ages],
    Kon: ['1+2'],
    ContentsCode: ['000007Y7'],
    Tid: [`from(${FROM_YEAR})`],
  })
  for (const { region, year, cells } of byRegionYear(population, 'Alder')) {
    const total = cells.totalt
    // DeSO 2025 codes answer 0 for years before they existed.
    if (!total) continue
    const sum = (keys: string[]) =>
      keys.reduce((s, k) => s + (cells[k] ?? 0), 0)
    push(region, year, 'population_total', total, 'persons', 'TAB6574')
    push(
      region,
      year,
      'population_share_age_0_19',
      sum(ages.slice(0, 4)) / total,
      'share',
      'TAB6574'
    )
    push(
      region,
      year,
      'population_share_age_65_plus',
      sum(ages.slice(4)) / total,
      'share',
      'TAB6574'
    )
  }

  // Economic standard: household disposable income adjusted for household
  // size. SCB has no plain median disposable income per DeSO.
  const income = await fetchTable('TAB6684', {
    Region: regions,
    ContentsCode: ['000008AB'],
    Tid: [`from(${FROM_YEAR})`],
  })
  for (const r of income) {
    push(
      r.Region,
      Number(r.Tid),
      'median_economic_standard_sek',
      r.value === null ? null : r.value * 1000,
      'SEK',
      'TAB6684'
    )
  }

  // Share below 60 % and above 200 % of the national median, in percent.
  const standard = await fetchTable('TAB6685', {
    Region: regions,
    Alder: ['tot'],
    ContentsCode: ['000008AC', '000008AD'],
    Tid: [`from(${FROM_YEAR})`],
  })
  for (const { region, year, cells } of byRegionYear(
    standard,
    'ContentsCode'
  )) {
    const pct = (v: number | null | undefined) => (v == null ? null : v / 100)
    push(
      region,
      year,
      'share_low_economic_standard',
      pct(cells['000008AC']),
      'share',
      'TAB6685'
    )
    push(
      region,
      year,
      'share_high_economic_standard',
      pct(cells['000008AD']),
      'share',
      'TAB6685'
    )
  }

  // Education level, ages 25-65. Levels 5 and 6 are post-secondary under and
  // over three years; the total includes unknown (US).
  const education = await fetchTable('TAB6534', {
    Region: regions,
    UtbildningsNiva: ['21', '3+4', '5', '6', 'US'],
    ContentsCode: ['000007Z6'],
    Tid: [`from(${FROM_YEAR})`],
  })
  for (const { region, year, cells } of byRegionYear(
    education,
    'UtbildningsNiva'
  )) {
    const total = Object.values(cells).reduce<number>((s, v) => s + (v ?? 0), 0)
    if (!total) continue
    push(
      region,
      year,
      'share_post_secondary_education',
      ((cells['5'] ?? 0) + (cells['6'] ?? 0)) / total,
      'share',
      'TAB6534'
    )
    push(
      region,
      year,
      'share_post_secondary_3y_plus',
      (cells['6'] ?? 0) / total,
      'share',
      'TAB6534'
    )
  }

  await upsertAreaStatistics(prisma, out)
  console.log(`Imported ${out.length} SCB values:`)
  summarize(out)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
