// Brå figures for Luleå, Boden and the nation. Brå has no API: the figures
// come from its published CSV and Excel files and its statistics database
// (SOL), whose download links change with every publication. Add a year here
// by hand when Brå publishes, then run `yarn import:bra`.
//
// - Reported crimes: final annual statistics, published in late March the
//   year after.
// - NTU (Nationella trygghetsundersökningen), people aged 16-84, published in
//   the autumn. The year is Brå's own label: exposure to crime refers to the
//   year before the survey, worry and problems to the survey year. Values are
//   stored as shares (0.168 = 16.8 %).
//
// NTU is reported per local police area (lokalpolisområde), which Brå names
// but does not code. Luleå and Boden share one, stored as POLICE_AREA
// 'lulea-boden'; a house in either municipality gets police_area_code
// 'lulea-boden'.
import type { AreaStatisticRow } from '../lib/areaStatistics.mts'

const SOL_MUNICIPALITY =
  'https://statistik.bra.se/solwebb/action/anmalda/urval/urval?menyid=101'
const SOL_NATION =
  'https://statistik.bra.se/solwebb/action/anmalda/urval/urval?menyid=98'
const CSV_2025 =
  'https://bra.se/download/18.3b6b697b19d24d83762a45f/1774625599791/Anm%C3%A4lda%20brott%20kommunerna%202025.csv'
const NTU_POLICE_AREAS =
  'https://bra.se/download/18.4d013ae91a11586438e21b0/1791464363865/Resultat%20f%C3%B6r%20polisomr%C3%A5de%20och%20lokalpolisomr%C3%A5de%20NTU%202017%E2%80%932026.xlsx'
const NTU_PAGE =
  'https://bra.se/statistik/statistik-fran-enkatundersokningar/nationella-trygghetsundersokningen'

type Area = Pick<AreaStatisticRow, 'areaLevel' | 'areaCode'>
const LULEA: Area = { areaLevel: 'MUNICIPALITY', areaCode: '2580' }
const BODEN: Area = { areaLevel: 'MUNICIPALITY', areaCode: '2582' }
const NATION: Area = { areaLevel: 'NATION', areaCode: 'SE' }
const LULEA_BODEN: Area = { areaLevel: 'POLICE_AREA', areaCode: 'lulea-boden' }

// [year, per 100 000 inhabitants, count]
type Crimes = [number, number, number][]

function reportedCrimes(
  area: Area,
  rows: Crimes,
  sourceFor: (year: number) => string
) {
  return rows.flatMap(([year, per100k, count]): AreaStatisticRow[] => {
    const common = { ...area, year, source: 'bra', sourceUrl: sourceFor(year) }
    return [
      {
        ...common,
        key: 'reported_crimes_per_100k',
        value: per100k,
        unit: 'per_100k',
      },
      { ...common, key: 'reported_crimes_count', value: count, unit: 'count' },
    ]
  })
}

// Percent per year, as Brå publishes it.
function ntu(
  area: Area,
  key: string,
  percentByYear: Record<number, number>,
  sourceUrl: string
) {
  return Object.entries(percentByYear).map(
    ([year, percent]): AreaStatisticRow => ({
      ...area,
      key,
      year: Number(year),
      value: percent / 100,
      unit: 'share',
      source: 'bra_ntu',
      sourceUrl,
    })
  )
}

const municipalSource = (year: number) =>
  year === 2025 ? CSV_2025 : SOL_MUNICIPALITY

export const braStatistics: AreaStatisticRow[] = [
  // Reported crimes, total ("Totalt antal brott").
  ...reportedCrimes(
    LULEA,
    [
      [2021, 11726, 9229],
      [2022, 11257, 8899],
      [2023, 11205, 8885],
      [2024, 10131, 8055],
      [2025, 10493, 8392],
    ],
    municipalSource
  ),
  ...reportedCrimes(
    BODEN,
    [
      [2021, 9701, 2727],
      [2022, 9191, 2583],
      [2023, 10734, 3005],
      [2024, 9840, 2755],
      [2025, 10569, 2995],
    ],
    municipalSource
  ),
  ...reportedCrimes(
    NATION,
    [
      [2021, 14215, 1480557],
      [2022, 13803, 1447470],
      [2023, 14349, 1511882],
      [2024, 14091, 1489319],
      [2025, 13581, 1439163],
    ],
    () => SOL_NATION
  ),

  // NTU L4.1: unsafe outdoors late in the evening in one's own neighbourhood.
  ...ntu(
    LULEA_BODEN,
    'ntu_unsafe_outdoors_evening_share',
    { 2022: 23.4, 2023: 19.9, 2024: 16.8, 2025: 15.8, 2026: 18.7 },
    NTU_POLICE_AREAS
  ),
  ...ntu(
    NATION,
    'ntu_unsafe_outdoors_evening_share',
    { 2022: 26.7, 2023: 26.5, 2024: 24.2, 2025: 25.0, 2026: 23.5 },
    NTU_PAGE
  ),
  // L4.6: worry about burglary.
  ...ntu(
    LULEA_BODEN,
    'ntu_worry_burglary_share',
    { 2024: 14.1, 2025: 14.7, 2026: 13.6 },
    NTU_POLICE_AREAS
  ),
  ...ntu(
    NATION,
    'ntu_worry_burglary_share',
    { 2024: 20.0, 2025: 19.7, 2026: 16.9 },
    NTU_PAGE
  ),
  // L3.1: exposed to a crime against the person (exposure year).
  ...ntu(
    LULEA_BODEN,
    'ntu_victim_personal_crime_share',
    { 2023: 17.0, 2024: 17.0, 2025: 16.5 },
    NTU_POLICE_AREAS
  ),
  ...ntu(NATION, 'ntu_victim_personal_crime_share', { 2025: 18.7 }, NTU_PAGE),
  // L3.14: households exposed to burglary (exposure year).
  ...ntu(
    LULEA_BODEN,
    'ntu_household_burglary_share',
    { 2023: 0.3, 2024: 1.1, 2025: 0.9 },
    NTU_POLICE_AREAS
  ),
  ...ntu(
    NATION,
    'ntu_household_burglary_share',
    { 2024: 1.2, 2025: 1.0 },
    NTU_PAGE
  ),
  // L4.21: gangs causing problems in the neighbourhood.
  ...ntu(
    LULEA_BODEN,
    'ntu_problem_gangs_share',
    { 2024: 2.0, 2025: 1.5, 2026: 1.8 },
    NTU_POLICE_AREAS
  ),
  ...ntu(
    NATION,
    'ntu_problem_gangs_share',
    { 2024: 5.7, 2025: 5.5, 2026: 4.5 },
    NTU_PAGE
  ),
  // L4.23: open drug dealing in the neighbourhood.
  ...ntu(
    LULEA_BODEN,
    'ntu_problem_open_drug_dealing_share',
    { 2024: 2.9, 2025: 1.7, 2026: 2.3 },
    NTU_POLICE_AREAS
  ),
  ...ntu(
    NATION,
    'ntu_problem_open_drug_dealing_share',
    { 2024: 5.6, 2025: 5.1, 2026: 4.2 },
    NTU_PAGE
  ),
]
