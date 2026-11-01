// What the forecast and the maintenance debt need to know about each
// component (CLAUDE.md, "Regler för beräkningen"): its profile, when it was
// installed and last painted, how long it lasts, how much of it there is and
// what a replacement or a repaint costs in start-year kronor. Worked out
// once per component and scenario, so the two calculations agree.
import type { CostUnit } from '@prisma/client'
import { flatten, valueOf } from '@/server/houses/derive'
import type { ComponentView, KeyValueView } from '@/server/houses/getHouse'
import { selectProfile } from '@/server/library/profiles'
import type { forecastDefaultsSchema } from '@/server/library/schema'
import type { z } from 'zod'
import { flag, type Flag } from './flags'

// low: longest lifespans and lowest costs; high: shortest and highest.
export type Scenario = 'low' | 'typical' | 'high'
export const SCENARIOS: Scenario[] = ['low', 'typical', 'high']
export type ByScenario<T = number> = Record<Scenario, T>

export const byScenario = <T>(f: (s: Scenario) => T): ByScenario<T> => ({
  low: f('low'),
  typical: f('typical'),
  high: f('high'),
})

export type ForecastDefaults = z.infer<typeof forecastDefaultsSchema>

export type ProfileRow = {
  type: string
  match: Record<string, string>
  lifespanMinYears: number
  lifespanTypicalYears: number
  lifespanMaxYears: number
  costLowSek: number | null
  costHighSek: number | null
  costUnit: CostUnit
  priceYear: number | null
  repaintMinYears: number | null
  repaintTypicalYears: number | null
  repaintMaxYears: number | null
  repaintCostLowSek: number | null
  repaintCostHighSek: number | null
}

export type Library = {
  defaults: Map<string, ForecastDefaults>
  profiles: ProfileRow[]
  // Brings a price from its price year to the start year (BKI).
  indexFactor: (priceYear: number) => number
}

// Parts every house has, assumed from the construction year when the
// documents do not mention them, so that a house is not cheaper for saying
// less (forecastDefaults.assumeUndocumented).
export const ASSUMED_PREFIX = 'assumed:'

export type ComponentPlan = {
  componentId: string
  // Not documented; stands in for a part every house has.
  assumed: boolean
  type: string
  name: string | null
  profile: Record<string, string>
  installYear: ByScenario
  // No installation_year of its own.
  installYearGuessed: boolean
  // Years from installation to replacement, adjusted for condition.
  lifespan: ByScenario
  // Years between later replacements, without the condition.
  fullLifespan: ByScenario
  // Condition 1: replaced within two years.
  soon: boolean
  quantity: number | null
  // Replacement cost of the whole component in start-year kronor.
  cost: ByScenario | null
  repaint: {
    lastPainted: ByScenario
    interval: ByScenario
    cost: ByScenario
  } | null
  // Low and typical renew this way instead of replacing, at its cost and
  // with its lifespan from then on (forecastDefaults.cheaperRenewal).
  renewal: {
    match: Record<string, string>
    cost: ByScenario
    fullLifespan: ByScenario
  } | null
  // The type's inspection, when the part has no inspected_year.
  inspection: ByScenario | null
  flags: Flag[]
}

type Rule = 'min' | 'typical' | 'max' | 'soon'
const DEFAULT_CONDITION_RULE: Record<string, Rule> = {
  '5': 'max',
  '4': 'typical',
  '3': 'typical',
  '2': 'min',
  '1': 'soon',
}

// Inputs read with less confidence than this are listed as uncertain.
export const CONFIDENT = 0.7

function numberValue(values: KeyValueView[], key: string, flags: Flag[]) {
  const v = values.find((x) => x.key === key)?.current
  if (!v || typeof v.value !== 'number') return undefined
  if (v.confidence !== null && v.confidence < CONFIDENT)
    flags.push(flag('uncertain', { key, confidence: v.confidence }))
  return v.value
}

const range = (min: number, typical: number, max: number): ByScenario => ({
  low: max,
  typical,
  high: min,
})

const costs = (low: number | null, high: number | null): ByScenario | null => {
  const lo = low ?? high
  const hi = high ?? low
  if (lo === null || hi === null) return null
  return { low: lo, typical: (lo + hi) / 2, high: hi }
}

const scale = (c: ByScenario, f: number): ByScenario =>
  byScenario((s) => c[s] * f)

// Perimeter of a footprint, in metres per square root of m2: a compact
// rectangle, as in KlarOffert's drainage examples (100 m2 about 40 m,
// 140 m2 about 48 m).
export const PERIMETER_PER_SQRT_M2 = 4

export function planComponents(
  components: ComponentView[],
  houseValues: KeyValueView[],
  library: Library,
  startYear: number
): ComponentPlan[] {
  const documented = flatten(components)
  const absent = valueOf(houseValues, 'absent_features')
  // Attributes a type reads from another part of the house, such as the
  // foundation type that prices drainage (forecastDefaults.context).
  const contextOf = (d: ForecastDefaults): Record<string, string> =>
    Object.fromEntries(
      Object.entries(d.context ?? {}).flatMap(([key, type]) => {
        const value = documented
          .filter((c) => c.type === type)
          .map((c) => valueOf(c.values, key))
          .find((v) => typeof v === 'string')
        return value === undefined ? [] : [[key, value as string]]
      })
    )
  // A part every house has, unless the house's context rules it out, such
  // as drainage on a plinth foundation.
  const ruledOut = (d: ForecastDefaults) =>
    Object.entries(d.assumeUnless ?? {}).some(([key, values]) => {
      const value = contextOf(d)[key]
      return value !== undefined && values.includes(value)
    })
  const assumed: ComponentView[] = [...library.defaults]
    .filter(
      ([type, d]) =>
        d.assumeUndocumented &&
        !ruledOut(d) &&
        !documented.some((c) => c.type === type) &&
        !(Array.isArray(absent) && absent.includes(type))
    )
    .map(([type]) => ({
      id: ASSUMED_PREFIX + type,
      type,
      name: null,
      draft: false,
      values: [],
      children: [],
    }))
  const all = [...documented, ...assumed]
  const constructionYear = valueOf(houseValues, 'construction_year')
  const livingArea = valueOf(houseValues, 'living_area')
  const floors = valueOf(houseValues, 'floor_count')
  const footprint =
    typeof livingArea === 'number' && typeof floors === 'number' && floors > 0
      ? livingArea / floors
      : undefined
  // The whole house's quantity of a type: from the footprint when the
  // number of floors is known, since roof and drainage follow the footprint
  // and the facade the perimeter and the floors; else per m2 living area.
  const estimate = (d: ForecastDefaults) => {
    const geometry = d.quantityFromFootprint
    if (geometry && footprint !== undefined) {
      const perimeter = PERIMETER_PER_SQRT_M2 * Math.sqrt(footprint)
      const total =
        geometry.basis === 'area'
          ? geometry.factor * footprint
          : geometry.basis === 'perimeter'
            ? geometry.factor * perimeter
            : geometry.factor * perimeter * (floors as number)
      return { total, fromFootprint: true }
    }
    if (d.quantityPerLivingM2 && typeof livingArea === 'number')
      return { total: d.quantityPerLivingM2 * livingArea, fromFootprint: false }
    return null
  }
  // Components of a type and the quantity they state, for sharing a
  // per-area estimate among those that state none.
  const quantities = (type: string, key: string) => {
    const of = all.filter((c) => c.type === type)
    const stated = of
      .map((c) => c.values.find((v) => v.key === key)?.current.value)
      .filter((v): v is number => typeof v === 'number')
    return {
      unstated: of.length - stated.length,
      stated: stated.reduce((t, v) => t + v, 0),
    }
  }

  return all.flatMap((c) => {
    const defaults = library.defaults.get(c.type) ?? {}
    const context = contextOf(defaults)
    const attributes: Record<string, string> = {
      ...context,
      ...Object.fromEntries(
        c.values
          .filter((v) => typeof v.current.value === 'string')
          .map((v) => [v.key, v.current.value as string])
      ),
    }
    const typeProfiles = library.profiles.filter((p) => p.type === c.type)
    const profile = selectProfile(
      typeProfiles,
      attributes,
      defaults.profileKeyOrder
    )
    // Types without a profile are shown and compared but cost nothing.
    if (!profile) return []
    const isAssumed = c.id.startsWith(ASSUMED_PREFIX)
    const flags: Flag[] = isAssumed ? [flag('assumed_part')] : []
    for (const [key, value] of Object.entries(profile.match))
      if (context[key] === value)
        flags.push(flag('priced_by_context', { key, value }))
    // A second bathroom in need is less urgent while another one works.
    const ofType = documented.filter((x) => x.type === c.type).length
    if (defaults.oneOfSeveral && ofType > 1)
      flags.push(flag('one_of_several', { count: ofType }))

    // Condition moves the replacement year.
    const condition = numberValue(c.values, 'condition', flags)
    const rule: Rule =
      condition === undefined
        ? 'typical'
        : ({ ...DEFAULT_CONDITION_RULE, ...defaults.conditionRule }[
            String(Math.round(condition))
          ] ?? 'typical')
    const years = {
      min: profile.lifespanMinYears,
      typical: profile.lifespanTypicalYears,
      max: profile.lifespanMaxYears,
    }
    const fullLifespan = range(years.min, years.typical, years.max)
    const lifespan = {
      ...fullLifespan,
      typical: rule === 'soon' ? years.min : years[rule],
    }

    // Installation year, else the house's, else anywhere in the lifespan.
    let installYear: ByScenario
    const installed = numberValue(c.values, 'installation_year', flags)
    if (installed !== undefined) {
      installYear = byScenario(() => installed)
    } else if (typeof constructionYear === 'number') {
      installYear = byScenario(() => constructionYear)
      flags.push(flag('construction_year_used'))
    } else {
      installYear = {
        low: startYear,
        typical: startYear - Math.round(years.typical / 2),
        high: startYear - years.min,
      }
      flags.push(flag('installation_year_unknown'))
    }

    // Quantity in a profile's unit.
    const quantityIn = (unit: CostUnit, flags: Flag[]): number | null => {
      if (unit === 'HOUSE') return 1
      const key =
        unit === 'M2' ? 'area' : unit === 'LINEAR_M' ? 'length' : 'quantity'
      const own = numberValue(c.values, key, flags)
      if (own !== undefined) return own
      // A per-area estimate stands for the whole house: what the other
      // components of the type do not state is shared among those that
      // state nothing, so listing parts without numbers does not make a
      // house cheaper.
      const whole = estimate(defaults)
      if (whole) {
        const { unstated, stated } = quantities(c.type, key)
        const share = (whole.total - stated) / unstated
        if (unit === 'EACH' ? share >= 1 : share > 0) {
          flags.push(
            whole.fromFootprint
              ? unstated === 1
                ? flag('quantity_from_footprint', {
                    key,
                    floors: floors as number,
                  })
                : flag('quantity_from_footprint_shared', {
                    key,
                    floors: floors as number,
                    count: unstated,
                  })
              : unstated === 1
                ? flag('quantity_estimated', { key })
                : flag('quantity_estimated_shared', { key, count: unstated })
          )
          return share
        }
      }
      if (unit === 'EACH') {
        // Types priced per window or door usually come in numbers.
        if (whole) flags.push(flag('quantity_one_assumed'))
        return 1
      }
      flags.push(flag('quantity_missing', { key }))
      return null
    }
    const quantity = quantityIn(profile.costUnit, flags)

    const costOf = (p: ProfileRow, q: number | null) => {
      const unitCost = costs(p.costLowSek, p.costHighSek)
      const index = p.priceYear ? library.indexFactor(p.priceYear) : 1
      return unitCost && q !== null ? scale(unitCost, q * index) : null
    }
    const index = profile.priceYear ? library.indexFactor(profile.priceYear) : 1
    if (!costs(profile.costLowSek, profile.costHighSek))
      flags.push(flag('profile_without_cost'))
    const cost = costOf(profile, quantity)

    // A cheaper way to renew, when the attributes allow it and the part is
    // not already renewed that way. An unknown attribute does not rule it
    // out: the inspection decides, as it does for a known one.
    let renewal: ComponentPlan['renewal'] = null
    const cheaper = defaults.cheaperRenewal
    if (
      cheaper &&
      Object.entries(cheaper.when).every(([k, values]) =>
        attributes[k] === undefined ? true : values.includes(attributes[k])
      )
    ) {
      const alternative = selectProfile(
        typeProfiles,
        { ...attributes, ...cheaper.match },
        defaults.profileKeyOrder
      )
      const renewalCost =
        alternative &&
        alternative !== profile &&
        costOf(
          alternative,
          alternative.costUnit === profile.costUnit
            ? quantity
            : quantityIn(alternative.costUnit, [])
        )
      if (alternative && renewalCost)
        renewal = {
          match: cheaper.match,
          cost: renewalCost,
          fullLifespan: range(
            alternative.lifespanMinYears,
            alternative.lifespanTypicalYears,
            alternative.lifespanMaxYears
          ),
        }
    }

    const inspection =
      defaults.inspection && c.values.every((v) => v.key !== 'inspected_year')
        ? scale(
            costs(
              defaults.inspection.costLowSek,
              defaults.inspection.costHighSek
            )!,
            library.indexFactor(defaults.inspection.priceYear)
          )
        : null

    // Repainting, counted from the last painting.
    let repaint: ComponentPlan['repaint'] = null
    const repaintCost = costs(
      profile.repaintCostLowSek,
      profile.repaintCostHighSek
    )
    if (
      profile.repaintMinYears &&
      profile.repaintTypicalYears &&
      profile.repaintMaxYears &&
      repaintCost &&
      quantity !== null
    ) {
      const paintType = attributes.paint_type
      const byPaint = paintType
        ? defaults.repaintByPaintType?.[paintType]
        : undefined
      const interval = byPaint
        ? range(byPaint.minYears, byPaint.typicalYears, byPaint.maxYears)
        : range(
            profile.repaintMinYears,
            profile.repaintTypicalYears,
            profile.repaintMaxYears
          )
      const painted = numberValue(c.values, 'last_painted_year', flags)
      if (painted === undefined) flags.push(flag('last_painted_missing'))
      repaint = {
        lastPainted:
          painted === undefined ? installYear : byScenario(() => painted),
        interval,
        cost: scale(repaintCost, quantity * index),
      }
    }

    return [
      {
        componentId: c.id,
        assumed: isAssumed,
        type: c.type,
        name: c.name,
        profile: profile.match,
        installYear,
        installYearGuessed: installed === undefined,
        lifespan,
        fullLifespan,
        soon: rule === 'soon',
        quantity,
        cost,
        repaint,
        renewal,
        inspection,
        flags,
      },
    ]
  })
}
