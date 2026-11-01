// Running costs per year (CLAUDE.md, "Kostnadsprognos", steps 3 and 4): the
// listing's figures first, then purchased energy times the energy price,
// then a rough estimate from the primary energy number. A total stated in
// the listing is never added to on top of its own parts.
import type { TariffCategory } from '@prisma/client'
import { heating } from '@/server/houses/derive'
import type { ComponentView, KeyValueView } from '@/server/houses/getHouse'
import { CONFIDENT, type ByScenario } from './plan'

export type RunningLine = {
  key: string
  base: ByScenario // per year in the start year
  trend: TariffCategory | null
  flags: string[]
}

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
): { lines: RunningLine[]; flags: string[] } {
  const lines: RunningLine[] = []
  const flags: string[] = []
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
      flags: r.uncertain
        ? [`${key} uncertain (confidence ${r.confidence})`]
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
      flags: partsSum
        ? ['the listing’s operating cost less the parts it names']
        : [],
    })
  }
  stated('property_fee_sek_per_year', null)

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
      flags.push('heating cost unknown: no price for pellets')
    } else if (price === null) {
      flags.push('heating cost unknown: no energy price for the municipality')
    } else if (kwh) {
      lines.push({
        key: 'heating_from_energy_use',
        base: spread(kwh.sek * price, kwh.uncertain ? 0.3 : 0.15),
        trend: heatingTrend,
        flags: [`heating_kwh_per_year × ${price} kr/kWh`],
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
        flags: [
          `estimated from energy_performance_kwh_per_m2 × living_area × Fgeo ${fgeo} / ${weight}: about ${Math.round(kwhEstimate)} kWh`,
        ],
      })
    } else {
      flags.push('heating cost unknown: no cost, energy use or energy class')
    }
  }
  if (!lines.length) flags.push('running costs unknown')
  return { lines, flags }
}
