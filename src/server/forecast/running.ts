// Running costs per year (CLAUDE.md, "Kostnadsprognos", steps 3 and 4): the
// listing's figures first, then purchased energy times the energy price,
// then a rough estimate from the primary energy number. A total stated in
// the listing is never added to on top of its own parts.
import type { TariffCategory } from '@prisma/client'
import { heating } from '@/server/houses/derive'
import type { ComponentView, KeyValueView } from '@/server/houses/getHouse'
import { flag, type Flag } from './flags'
import { CONFIDENT, type ByScenario } from './plan'

// Stated in the listing, worked out from purchased energy, or estimated
// from the primary energy number.
export type RunningBasis = 'stated' | 'from_energy' | 'estimated'

export type RunningLine = {
  key: string
  base: ByScenario // per year in the start year
  // From this year on the line is `later.base` instead: the ground rent after
  // its revision year, the same amount but uncertain.
  later?: { fromYear: number; base: ByScenario }
  trend: TariffCategory | null
  basis: RunningBasis
  flags: Flag[]
}

// The lines that together are the house's energy cost: heating however it
// is worked out, and household electricity, which in an electrically heated
// house often includes the heating. Compared as one.
export const ENERGY_KEYS = [
  'heating_cost_sek_per_year',
  'household_electricity_cost_sek_per_year',
  'heating_from_energy_use',
  'heating_estimated',
]
// The listing's total, or what remains of it after its named parts.
export const OPERATING_TOTAL_KEYS = [
  'operating_cost_sek_per_year',
  'other_operating_cost',
]

export type EnergyPrices = {
  electricitySekPerKwh: number | null
  districtHeatingSekPerKwh: number | null
}

// The parts a listing's driftkostnad usually covers. The property fee is
// separate and always its own line.
const PARTS: { key: string; trend: TariffCategory | null }[] = [
  { key: 'heating_cost_sek_per_year', trend: null },
  { key: 'household_electricity_cost_sek_per_year', trend: 'ELECTRICITY' },
  { key: 'water_sewage_cost_sek_per_year', trend: 'WATER_SEWAGE' },
  { key: 'waste_cost_sek_per_year', trend: 'WASTE' },
  { key: 'insurance_cost_sek_per_year', trend: null },
  { key: 'chimney_sweeping_cost_sek_per_year', trend: null },
]

// BBR 29 weighting factors (viktningsfaktorer) for the primary energy number.
const WEIGHT_ELECTRICITY = 1.8
const WEIGHT_DISTRICT_HEATING = 0.7

// How far low and high lie from an uncertain stated amount.
const UNCERTAIN_SHARE = 0.2

const spread = (sek: number, share: number): ByScenario => ({
  low: sek * (1 - share),
  typical: sek,
  high: sek * (1 + share),
})

export function runningCosts(
  values: KeyValueView[],
  components: ComponentView[],
  prices: EnergyPrices,
  fgeo: number | null
): { lines: RunningLine[]; flags: Flag[] } {
  const lines: RunningLine[] = []
  const flags: Flag[] = []
  const read = (key: string) => {
    const v = values.find((x) => x.key === key)?.current
    if (!v || typeof v.value !== 'number') return undefined
    const uncertain = v.confidence !== null && v.confidence < CONFIDENT
    return { sek: v.value, uncertain, confidence: v.confidence }
  }
  const stated = (key: string, trend: TariffCategory | null) => {
    const r = read(key)
    if (!r) return 0
    lines.push({
      key,
      base: spread(r.sek, r.uncertain ? 0.2 : 0),
      trend,
      basis: 'stated',
      flags: r.uncertain
        ? [flag('uncertain', { key, confidence: r.confidence! })]
        : [],
    })
    return r.sek
  }

  const main = heating(components).main
  const districtHeated = main.includes('district_heating_substation')
  const heatingTrend: TariffCategory | null = districtHeated
    ? 'DISTRICT_HEATING'
    : null
  const parts = PARTS.map((p) =>
    p.key === 'heating_cost_sek_per_year' ? { ...p, trend: heatingTrend } : p
  )
  const partsSum = parts.reduce((sum, p) => sum + stated(p.key, p.trend), 0)
  const total = read('operating_cost_sek_per_year')
  if (total && total.sek > partsSum) {
    lines.push({
      key: partsSum ? 'other_operating_cost' : 'operating_cost_sek_per_year',
      base: spread(total.sek - partsSum, total.uncertain ? 0.2 : 0),
      trend: null,
      basis: 'stated',
      flags: partsSum ? [flag('operating_cost_less_parts')] : [],
    })
  }
  stated('property_fee_sek_per_year', null)
  groundRent()

  // Ground rent (tomträttsavgäld, CLAUDE.md, "Regler för beräkningen"): the
  // stated rent up to its revision year; after it the same amount, since the
  // new rent cannot be worked out in advance, but uncertain. Without a
  // revision year the whole line is uncertain.
  function groundRent() {
    const rent = read('ground_rent_sek_per_year')
    if (!rent) return
    const revision = read('ground_rent_revision_year')
    const flags: Flag[] = rent.uncertain
      ? [
          flag('uncertain', {
            key: 'ground_rent_sek_per_year',
            confidence: rent.confidence!,
          }),
        ]
      : []
    const uncertain = spread(rent.sek, UNCERTAIN_SHARE)
    if (revision) {
      flags.push(flag('ground_rent_revised', { year: revision.sek }))
      lines.push({
        key: 'ground_rent_sek_per_year',
        basis: 'stated',
        base: spread(rent.sek, rent.uncertain ? UNCERTAIN_SHARE : 0),
        later: { fromYear: revision.sek, base: uncertain },
        trend: null,
        flags,
      })
    } else {
      flags.push(flag('ground_rent_no_revision_year'))
      lines.push({
        key: 'ground_rent_sek_per_year',
        basis: 'stated',
        base: uncertain,
        trend: null,
        flags,
      })
    }
  }

  // Heating from energy when the listing gives no cost for it, and no total
  // that would already include it.
  if (!total && !read('heating_cost_sek_per_year')) {
    const price = districtHeated
      ? prices.districtHeatingSekPerKwh
      : prices.electricitySekPerKwh
    const kwh = read('heating_kwh_per_year')
    const performance = read('energy_performance_kwh_per_m2')
    const area = read('living_area')
    if (main.includes('pellet_boiler') && !districtHeated) {
      flags.push(flag('heating_no_pellet_price'))
    } else if (price === null) {
      flags.push(flag('heating_no_energy_price'))
    } else if (kwh) {
      lines.push({
        key: 'heating_from_energy_use',
        base: spread(kwh.sek * price, kwh.uncertain ? 0.3 : 0.15),
        trend: heatingTrend,
        basis: 'from_energy',
        flags: [flag('heating_from_energy_use', { price })],
      })
    } else if (performance && area && fgeo) {
      // Primary energy = purchased energy × weight / Fgeo per m2, so the
      // purchased energy is roughly the reverse. It covers heating, hot
      // water and the building's electricity, not the household's.
      const weight = districtHeated
        ? WEIGHT_DISTRICT_HEATING
        : WEIGHT_ELECTRICITY
      const kwhEstimate = (performance.sek * area.sek * fgeo) / weight
      lines.push({
        key: 'heating_estimated',
        base: spread(kwhEstimate * price, 0.3),
        trend: heatingTrend,
        basis: 'estimated',
        flags: [
          flag('heating_estimated', {
            fgeo,
            weight,
            kwh: Math.round(kwhEstimate),
          }),
        ],
      })
    } else {
      flags.push(flag('heating_unknown'))
    }
  }
  if (!lines.length) flags.push(flag('running_costs_unknown'))
  return { lines, flags }
}
