// Reference values per municipality (CLAUDE.md, "Kostnadsprognos", step 4),
// researched 2026-11-01. Each value names its source in a comment, since
// Municipality has no column for it.
//
// Rules in force: BFS 2026:9 replaced BBR (BFS 2011:6) on 2026-10-01 and keeps
// Fgeo per municipality in bilaga 3; BFS 2024:6 replaced EKS for snow loads
// on 2025-07-01. Boverket's klimatlast API gives s_k for a coordinate:
// https://api.boverket.se/klimatlast/v2/snolast?x-koord={N}&y-koord={E}
// (SWEREF 99 TM).
import type { TariffCategory } from '@prisma/client'

export type MunicipalitySeed = {
  code: string // SCB municipality code
  name: string
  groundSnowLoadKnM2: number | null // s_k, BFS 2024:6
  fgeo: number | null // geografisk justeringsfaktor, BFS 2026:9 bilaga 3
  dvutC: number | null // dimensionerande vinterutetemperatur
  cloudburstMapUrl: string | null
}

// Sources:
// BFS_2026_9: https://rinfo.boverket.se/BFS2026-9/pdf/BFS2026-9.pdf
// DVUT_1991_2020: https://www.boverket.se/contentassets/78ea1170505245b8b105e163b56dff27/dvut_1991_2020.csv
//
// DVUT with a time constant of one day (1-dygn), from Boverket's and SMHI's
// DVUT 1991-2020. A light timber villa cools quickly; no official typical
// time constant exists, so this is a judgement. Two and three days: Luleå
// -24.5 and -23.8, Boden -26.5 and -25.6.
export const municipalities: MunicipalitySeed[] = [
  {
    code: '2580',
    name: 'Luleå',
    // Boverket klimatlast API: 3.0 in Gammelstad, Sunderbyn, Råneå and
    // Kallax, 2.5 in the city centre. The higher value is used.
    groundSnowLoadKnM2: 3.0,
    fgeo: 1.5, // BFS_2026_9, same as BBR 29
    dvutC: -25.4, // DVUT_1991_2020, station Luleå 102005
    // Länsstyrelsen Norrbotten, skyfallsmodellering (PDF).
    cloudburstMapUrl:
      'https://ext-dokument.lansstyrelsen.se/norrbotten/planeringsunderlag/Lule%C3%A5%20-%20Skyfallsmodellering%20Norrbotten.pdf',
  },
  {
    code: '2582',
    name: 'Boden',
    groundSnowLoadKnM2: 3.0, // Boverket klimatlast API, whole municipality
    fgeo: 1.6, // BFS_2026_9; 1.5 under BBR 29
    dvutC: -27.8, // DVUT_1991_2020, station Boden 102006
    cloudburstMapUrl:
      'https://ext-dokument.lansstyrelsen.se/norrbotten/planeringsunderlag/Boden%20-%20Skyfallsmodellering%20Norrbotten.pdf',
  },
]

// Energy prices for a villa, as defaults for the forecast (milestone 5).
// Not stored yet: Assumption has no level per municipality.
export const energyPrices = {
  // SCB elhandel SE1, villa med elvärme, mean Oct 2025-Sep 2026, plus the
  // network fee (Ei, Villa 20A, 20 000 kWh/year, 2026) and the reduced
  // Norrbotten energy tax of 26.4 öre, including VAT. SCB's series is an
  // unweighted mean of offered prices, so an electrically heated house that
  // uses most in winter probably pays more.
  electricitySekPerKwh: { '2580': 1.44, '2582': 1.53 },
  electricitySources: [
    'https://api.scb.se/OV0104/v1/doris/sv/ssd/START/EN/EN0301/EN0301A/SSDManadElhandelpris',
    'https://ei.se/download/18.71c90939186a1c167f0131a5/1778570543830/Hush%C3%A5llskunder-eln%C3%A4tsf%C3%B6retagens-eln%C3%A4tsavgifter.xlsx',
  ],
  // Luleå Energi's price example for a villa using 20 MWh/year, 2026. Bodens
  // Energi publishes only tariff components (1 250 kr/kW/year, 594 kr/MWh in
  // winter, 304 in summer), so Boden has no per-kWh figure.
  districtHeatingSekPerKwh: { '2580': 0.78, '2582': null },
  districtHeatingSources: [
    'https://www.luleaenergi.se/produktion-och-infrastruktur/fjarrvarme/priser-och-avtalsvillkor/lulea-villor-2026/',
    'https://bodensenergi.se/fjarrvarme/fjarrvarmepriser-privat/',
  ],
}

// Year-on-year change per category from the Nils Holgersson report, appendix
// 1-3. The report's standard building is a block of 15 flats; there is no
// småhus version. ELECTRICITY is the network fee only. 2020 electricity is
// missing (it would need the 2019 report).
type TariffChangeSeed = {
  municipalityCode: string
  year: number
  category: TariffCategory
  changeFraction: number // 0.079 = +7.9 %
  sourceUrl: string
}

const NH2020 =
  'https://nilsholgersson.nu/wp-content/uploads/2020/12/NH2020_Bilaga1-3_v201207.xlsx'
const NH2021 =
  'https://nilsholgersson.nu/wp-content/uploads/2021/11/NH2021_Bilaga1-3.xlsx'
const NH2022 =
  'https://nilsholgersson.nu/wp-content/uploads/2022/11/NH2022_Bilaga1-3_v221110.xlsx'
const NH2023 =
  'https://nilsholgersson.nu/wp-content/uploads/2023/10/NH2023_Bilaga1-3_v231018.xlsx'
const NH2024 =
  'https://nilsholgersson.nu/wp-content/uploads/2024/11/NH2024_Bilaga1-3_v241120.xlsx'
const NH2025 =
  'https://nilsholgersson.nu/wp-content/uploads/2025/11/NH2025_Bilaga1-3.xlsx'
const NH2026 =
  'https://nilsholgersson.nu/wp-content/uploads/2026/10/NH2026_Bilaga1-3-1.xlsx'

// prettier-ignore
export const tariffChanges: TariffChangeSeed[] = [
  { municipalityCode: '2580', year: 2020, category: 'WASTE', changeFraction: 0.059, sourceUrl: NH2020 },
  { municipalityCode: '2580', year: 2020, category: 'WATER_SEWAGE', changeFraction: 0.014, sourceUrl: NH2020 },
  { municipalityCode: '2580', year: 2020, category: 'DISTRICT_HEATING', changeFraction: 0.0287, sourceUrl: NH2020 },
  { municipalityCode: '2580', year: 2021, category: 'WASTE', changeFraction: 0, sourceUrl: NH2021 },
  { municipalityCode: '2580', year: 2021, category: 'WATER_SEWAGE', changeFraction: 0.0297, sourceUrl: NH2021 },
  { municipalityCode: '2580', year: 2021, category: 'DISTRICT_HEATING', changeFraction: 0.0274, sourceUrl: NH2021 },
  { municipalityCode: '2580', year: 2021, category: 'ELECTRICITY', changeFraction: 0.0308, sourceUrl: NH2021 },
  { municipalityCode: '2580', year: 2022, category: 'WASTE', changeFraction: 0.2196, sourceUrl: NH2022 },
  { municipalityCode: '2580', year: 2022, category: 'WATER_SEWAGE', changeFraction: 0.05, sourceUrl: NH2022 },
  { municipalityCode: '2580', year: 2022, category: 'DISTRICT_HEATING', changeFraction: 0.0461, sourceUrl: NH2022 },
  { municipalityCode: '2580', year: 2022, category: 'ELECTRICITY', changeFraction: 0.0303, sourceUrl: NH2022 },
  { municipalityCode: '2580', year: 2023, category: 'WASTE', changeFraction: 0, sourceUrl: NH2023 },
  { municipalityCode: '2580', year: 2023, category: 'WATER_SEWAGE', changeFraction: 0.1, sourceUrl: NH2023 },
  { municipalityCode: '2580', year: 2023, category: 'DISTRICT_HEATING', changeFraction: 0.0603, sourceUrl: NH2023 },
  { municipalityCode: '2580', year: 2023, category: 'ELECTRICITY', changeFraction: 0.0345, sourceUrl: NH2023 },
  { municipalityCode: '2580', year: 2024, category: 'WASTE', changeFraction: -0.1398, sourceUrl: NH2024 },
  { municipalityCode: '2580', year: 2024, category: 'WATER_SEWAGE', changeFraction: 0.2, sourceUrl: NH2024 },
  { municipalityCode: '2580', year: 2024, category: 'DISTRICT_HEATING', changeFraction: 0.0466, sourceUrl: NH2024 },
  { municipalityCode: '2580', year: 2024, category: 'ELECTRICITY', changeFraction: 0.0915, sourceUrl: NH2024 },
  { municipalityCode: '2580', year: 2025, category: 'WASTE', changeFraction: 0.1477, sourceUrl: NH2025 },
  { municipalityCode: '2580', year: 2025, category: 'WATER_SEWAGE', changeFraction: 0.0999, sourceUrl: NH2025 },
  { municipalityCode: '2580', year: 2025, category: 'DISTRICT_HEATING', changeFraction: 0.0548, sourceUrl: NH2025 },
  { municipalityCode: '2580', year: 2025, category: 'ELECTRICITY', changeFraction: 0.0715, sourceUrl: NH2025 },
  { municipalityCode: '2580', year: 2026, category: 'WASTE', changeFraction: 0.1613, sourceUrl: NH2026 },
  { municipalityCode: '2580', year: 2026, category: 'WATER_SEWAGE', changeFraction: 0.0903, sourceUrl: NH2026 },
  { municipalityCode: '2580', year: 2026, category: 'DISTRICT_HEATING', changeFraction: 0.0511, sourceUrl: NH2026 },
  { municipalityCode: '2580', year: 2026, category: 'ELECTRICITY', changeFraction: 0.0905, sourceUrl: NH2026 },
  { municipalityCode: '2582', year: 2020, category: 'WASTE', changeFraction: 0.0794, sourceUrl: NH2020 },
  { municipalityCode: '2582', year: 2020, category: 'WATER_SEWAGE', changeFraction: 0.1, sourceUrl: NH2020 },
  { municipalityCode: '2582', year: 2020, category: 'DISTRICT_HEATING', changeFraction: 0.0467, sourceUrl: NH2020 },
  { municipalityCode: '2582', year: 2021, category: 'WASTE', changeFraction: -0.0108, sourceUrl: NH2021 },
  { municipalityCode: '2582', year: 2021, category: 'WATER_SEWAGE', changeFraction: 0.05, sourceUrl: NH2021 },
  { municipalityCode: '2582', year: 2021, category: 'DISTRICT_HEATING', changeFraction: 0.056, sourceUrl: NH2021 },
  { municipalityCode: '2582', year: 2021, category: 'ELECTRICITY', changeFraction: 0.0447, sourceUrl: NH2021 },
  { municipalityCode: '2582', year: 2022, category: 'WASTE', changeFraction: 0.0326, sourceUrl: NH2022 },
  { municipalityCode: '2582', year: 2022, category: 'WATER_SEWAGE', changeFraction: 0.07, sourceUrl: NH2022 },
  { municipalityCode: '2582', year: 2022, category: 'DISTRICT_HEATING', changeFraction: 0.0345, sourceUrl: NH2022 },
  { municipalityCode: '2582', year: 2022, category: 'ELECTRICITY', changeFraction: 0.0355, sourceUrl: NH2022 },
  { municipalityCode: '2582', year: 2023, category: 'WASTE', changeFraction: 0.0604, sourceUrl: NH2023 },
  { municipalityCode: '2582', year: 2023, category: 'WATER_SEWAGE', changeFraction: 0.1071, sourceUrl: NH2023 },
  { municipalityCode: '2582', year: 2023, category: 'DISTRICT_HEATING', changeFraction: 0.0602, sourceUrl: NH2023 },
  { municipalityCode: '2582', year: 2023, category: 'ELECTRICITY', changeFraction: 0.0399, sourceUrl: NH2023 },
  { municipalityCode: '2582', year: 2024, category: 'WASTE', changeFraction: 0.1257, sourceUrl: NH2024 },
  { municipalityCode: '2582', year: 2024, category: 'WATER_SEWAGE', changeFraction: 0.251, sourceUrl: NH2024 },
  { municipalityCode: '2582', year: 2024, category: 'DISTRICT_HEATING', changeFraction: 0.0714, sourceUrl: NH2024 },
  { municipalityCode: '2582', year: 2024, category: 'ELECTRICITY', changeFraction: 0.0493, sourceUrl: NH2024 },
  { municipalityCode: '2582', year: 2025, category: 'WASTE', changeFraction: 0.1099, sourceUrl: NH2025 },
  { municipalityCode: '2582', year: 2025, category: 'WATER_SEWAGE', changeFraction: 0.1101, sourceUrl: NH2025 },
  { municipalityCode: '2582', year: 2025, category: 'DISTRICT_HEATING', changeFraction: 0.0824, sourceUrl: NH2025 },
  { municipalityCode: '2582', year: 2025, category: 'ELECTRICITY', changeFraction: 0.0829, sourceUrl: NH2025 },
  { municipalityCode: '2582', year: 2026, category: 'WASTE', changeFraction: 0.0701, sourceUrl: NH2026 },
  { municipalityCode: '2582', year: 2026, category: 'WATER_SEWAGE', changeFraction: 0.1114, sourceUrl: NH2026 },
  { municipalityCode: '2582', year: 2026, category: 'DISTRICT_HEATING', changeFraction: 0.0697, sourceUrl: NH2026 },
  { municipalityCode: '2582', year: 2026, category: 'ELECTRICITY', changeFraction: 0.0836, sourceUrl: NH2026 },
]
