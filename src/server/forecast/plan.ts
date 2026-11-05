// What the forecast and the maintenance debt need to know about each
// component (CLAUDE.md, "Regler för beräkningen"): its profile, when it was
// installed and last painted, how long it lasts, how much of it there is and
// what a replacement or a repaint costs in start-year kronor. Worked out
// once per component and scenario, so the two calculations agree.
import type { CostUnit } from '@prisma/client'
import { looksLikeOtherBuilding } from '@/server/houses/buildings'
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
// less (forecastDefaults.assumeUndocumented). An assumed part's id is
// assumed:<type>, and a variant with given values
// assumed:<type>:<key>=<value>[,<key>=<value>] (assumeVariants).
export const ASSUMED_PREFIX = 'assumed:'

export const assumedId = (type: string, values: Record<string, string> = {}) =>
  ASSUMED_PREFIX +
  type +
  (Object.keys(values).length
    ? ':' +
      Object.entries(values)
        .map(([k, v]) => `${k}=${v}`)
        .join(',')
    : '')

// The type and values an assumed id stands for; null for any other id.
export function parseAssumedId(id: string) {
  if (!id.startsWith(ASSUMED_PREFIX)) return null
  const [type, rest] = id.slice(ASSUMED_PREFIX.length).split(':')
  const values = Object.fromEntries(
    (rest ? rest.split(',') : []).map((pair) => {
      const [key, value] = pair.split('=')
      return [key, value ?? '']
    })
  )
  return { type, values }
}

// How much of a lifespan a partial renovation gives the part, counted from
// the renovation: new fronts and worktops or new fixtures leave the carcass,
// the appliances and the membrane as old as they were, so a third unless the
// type says otherwise (forecastDefaults.partialRenovationShare; CLAUDE.md,
// "Regler för beräkningen").
export const PARTIAL_RENOVATION_SHARE = 1 / 3

// An entrance platform or steps registered as a deck (entrébro, farstubro,
// förstukvist, entrétrappa): far smaller than a terrace when no area is
// stated. A name that also says altan or terrass is a deck of the usual size.
const ENTRANCE = /entr[eé]|farstu|f[öo]rstu|trapp/i
const TERRACE = /altan|terrass/i
export const looksLikeEntrance = (name: string | null | undefined) =>
  !!name && ENTRANCE.test(name) && !TERRACE.test(name)

// Types whose top-level parts share the house's estimated area, so one that
// belongs to another building must be registered under it.
export const SHARED_ENVELOPE_TYPES = ['roof_covering', 'facade']

// What a part's age rests on: its own installation year, the house's
// construction year, nothing (anywhere in the lifespan), or the part is
// assumed, since the documents do not mention it.
export type PlanBasis =
  'documented' | 'construction_year' | 'unknown_year' | 'assumed'

export type ComponentPlan = {
  componentId: string
  // Not documented; stands in for a part every house has.
  assumed: boolean
  basis: PlanBasis
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

// An attached garage shares one of its four walls with the house.
export const ATTACHED_WALL_SHARE = 0.75

export function planComponents(
  components: ComponentView[],
  houseValues: KeyValueView[],
  library: Library,
  startYear: number
): ComponentPlan[] {
  const documented = flatten(components)
  // Parts under a building of its own, such as a garage's roof
  // (forecastDefaults.separateBuilding): they take no share of the house's
  // estimate and do not stand in for a part of the house. What they do not
  // state is estimated from the building's own area.
  const buildingOf = new Map<string, ComponentView>()
  const collectBuildings = (c: ComponentView) => {
    if (library.defaults.get(c.type)?.separateBuilding)
      for (const x of flatten(c.children)) buildingOf.set(x.id, c)
    else c.children.forEach(collectBuildings)
  }
  components.forEach(collectBuildings)
  // A building's assumed part tried with an answer (whatIf.ts) comes back
  // at top level; its id says which building it belongs to.
  for (const c of documented) {
    const id = parseAssumedId(c.id)?.values.building
    const building = id && documented.find((x) => x.id === id)
    if (building) buildingOf.set(c.id, building)
  }
  const houseParts = documented.filter((c) => !buildingOf.has(c.id))
  const absent = valueOf(houseValues, 'absent_features')
  // Attributes a type reads from another part of the house, such as the
  // foundation type that prices drainage (forecastDefaults.context).
  const contextOf = (d: ForecastDefaults): Record<string, string> =>
    Object.fromEntries(
      Object.entries(d.context ?? {}).flatMap(([key, type]) => {
        const value = houseParts
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
  // A part assumed only for houses with one of the parts it belongs to
  // (assumeWhenTypes), and not where a top-level part does the same job
  // (assumeUnlessParts): radiators belong to a water-borne heat source and
  // are not assumed beside water underfloor heating.
  const belongs = (d: ForecastDefaults) =>
    !d.assumeWhenTypes ||
    houseParts.some((c) => d.assumeWhenTypes!.includes(c.type))
  const replacedBy = (d: ForecastDefaults) =>
    (d.assumeUnlessParts ?? []).some((part) =>
      components.some(
        (c) =>
          c.type === part.type &&
          Object.entries(part.where ?? {}).every(([key, values]) => {
            const value = valueOf(c.values, key)
            return typeof value !== 'string' || values.includes(value)
          })
      )
    )
  const assumedValue = (key: string, value: string): KeyValueView => ({
    key,
    current: {
      id: `${ASSUMED_PREFIX}${key}`,
      key,
      value,
      unit: null,
      source: 'CLAUDE',
      confidence: null,
      quote: null,
      documentId: null,
      recordedAt: new Date(0),
      draft: false,
    },
    alternatives: [],
  })
  const assumed: ComponentView[] = [...library.defaults].flatMap(
    ([type, d]) => {
      if (Array.isArray(absent) && absent.includes(type)) return []
      const parts: ComponentView[] = []
      if (
        d.assumeUndocumented &&
        !ruledOut(d) &&
        belongs(d) &&
        !replacedBy(d) &&
        !houseParts.some((c) => c.type === type)
      )
        parts.push({
          id: ASSUMED_PREFIX + type,
          type,
          name: null,
          draft: false,
          values: [],
          children: [],
        })
      // A variant with given values, when the context calls for it and no
      // documented part of the type has those values.
      const context = contextOf(d)
      for (const variant of d.assumeVariants ?? []) {
        const called = Object.entries(variant.whenContext).every(
          ([key, values]) =>
            context[key] !== undefined && values.includes(context[key])
        )
        const has = houseParts.some(
          (c) =>
            c.type === type &&
            Object.entries(variant.values).every(
              ([key, value]) => valueOf(c.values, key) === value
            )
        )
        if (called && !has)
          parts.push({
            id: assumedId(type, variant.values),
            type,
            name: null,
            draft: false,
            values: Object.entries(variant.values).map(([k, v]) =>
              assumedValue(k, v)
            ),
            children: [],
          })
      }
      return parts
    }
  )
  // What a building must have although nothing registers it: a garage's roof
  // and facade (forecastDefaults.assumeParts), so that a garage is not free
  // for being mentioned without its parts. Not where a part of that type sits
  // at top level under a name that places it on another building, since it
  // is counted there already and the fix is to move it.
  const buildingParts: ComponentView[] = documented.flatMap((building) =>
    (library.defaults.get(building.type)?.assumeParts ?? []).flatMap((type) => {
      const id = assumedId(type, { building: building.id })
      if (
        flatten(building.children).some((x) => x.type === type) ||
        documented.some((x) => x.id === id) ||
        components.some(
          (x) => x.type === type && looksLikeOtherBuilding(x.name)
        )
      )
        return []
      const part: ComponentView = {
        id,
        type,
        name: building.name,
        draft: false,
        values: [],
        children: [],
      }
      buildingOf.set(id, building)
      return [part]
    })
  )
  const all = [...documented, ...assumed, ...buildingParts]
  const constructionYear = valueOf(houseValues, 'construction_year')
  const livingArea = valueOf(houseValues, 'living_area')
  const secondaryArea = valueOf(houseValues, 'secondary_area')
  const floors = valueOf(houseValues, 'floor_count')
  // The floor area on the ground. A basement is mostly secondary area and
  // seldom counted among the floors, so with a basement the footprint is
  // the living and secondary area together over one floor more.
  const hasBasement = houseParts.some(
    (c) =>
      c.type === 'foundation' &&
      valueOf(c.values, 'foundation_type') === 'basement'
  )
  const withSecondary =
    hasBasement && typeof secondaryArea === 'number' && secondaryArea > 0
  const footprint =
    typeof livingArea === 'number' && typeof floors === 'number' && floors > 0
      ? withSecondary
        ? (livingArea + (secondaryArea as number)) / (floors + 1)
        : livingArea / floors
      : undefined
  const footprintFloors = withSecondary ? (floors as number) + 1 : floors
  // A quantity from a footprint: roof and drainage follow its area or its
  // perimeter, the facade the perimeter and the floors.
  const fromFootprint = (
    geometry: NonNullable<ForecastDefaults['quantityFromFootprint']>,
    area: number,
    storeys: number
  ) => {
    const perimeter = PERIMETER_PER_SQRT_M2 * Math.sqrt(area)
    return geometry.basis === 'area'
      ? geometry.factor * area
      : geometry.basis === 'perimeter'
        ? geometry.factor * perimeter
        : geometry.factor * perimeter * storeys
  }
  // The whole house's quantity of a type: from the footprint when the
  // number of floors is known; else per m2 living area.
  const estimate = (d: ForecastDefaults) => {
    const geometry = d.quantityFromFootprint
    if (geometry && footprint !== undefined)
      return {
        total: fromFootprint(geometry, footprint, floors as number),
        fromFootprint: true,
      }
    if (d.quantityPerLivingM2 && typeof livingArea === 'number')
      return { total: d.quantityPerLivingM2 * livingArea, fromFootprint: false }
    return null
  }
  // A building's area as its parts read it: its own, else a usual size for
  // the type (forecastDefaults.assumedQuantity), so that a garage whose size
  // no document gives still has a roof that costs something.
  const buildingArea = (building: ComponentView) => {
    const own = valueOf(building.values, 'area')
    if (typeof own === 'number' && own > 0) return { area: own, assumed: false }
    const usual = library.defaults.get(building.type)?.assumedQuantity
    return usual === undefined ? null : { area: usual, assumed: true }
  }
  // The components of a type that share an estimate, the house's or one
  // building's, and the quantity they state, for sharing the estimate among
  // those that state none. A component without a quantity may state its
  // share of the whole instead (a mixed facade: brick 0.7, wood 0.3); the
  // rest is split equally among those that state neither.
  const quantities = (
    type: string,
    key: string,
    building: ComponentView | undefined
  ) => {
    const of = all.filter(
      (c) => c.type === type && buildingOf.get(c.id) === building
    )
    const stated = of
      .map((c) => c.values.find((v) => v.key === key)?.current.value)
      .filter((v): v is number => typeof v === 'number')
    const unstated = of.filter(
      (c) =>
        typeof c.values.find((v) => v.key === key)?.current.value !== 'number'
    )
    const shares = unstated
      .map((c) => valueOf(c.values, 'share'))
      .filter((v): v is number => typeof v === 'number' && v > 0 && v <= 1)
    return {
      unstated: unstated.length - shares.length,
      stated: stated.reduce((t, v) => t + v, 0),
      shares: shares.reduce((t, v) => t + v, 0),
    }
  }
  const topLevel = new Set(components.map((c) => c.id))

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
    const building = buildingOf.get(c.id)
    const flags: Flag[] = !isAssumed
      ? []
      : building
        ? [flag('assumed_building_part')]
        : [flag('assumed_part')]
    for (const [key, value] of Object.entries(profile.match))
      if (context[key] === value)
        flags.push(flag('priced_by_context', { key, value }))
    // A second bathroom in need is less urgent while another one works.
    const ofType = documented.filter((x) => x.type === c.type).length
    if (defaults.oneOfSeveral && ofType > 1)
      flags.push(flag('one_of_several', { count: ofType }))
    // The type's default profile stands in while the attribute that would
    // pick a narrower one is unknown: a driveway without a surface.
    if (!Object.keys(profile.match).length) {
      const deciding = [
        ...new Set(typeProfiles.flatMap((p) => Object.keys(p.match))),
      ].filter((key) => attributes[key] === undefined)
      if (deciding.length)
        flags.push(flag('profile_default_used', { keys: deciding.join(', ') }))
    }
    // A roof or facade at top level that by its name belongs to a garage or
    // an outbuilding takes a share of the house's estimated area; it
    // belongs under that building (CLAUDE.md, "Byggnader prissätts genom
    // sina delar").
    if (
      topLevel.has(c.id) &&
      SHARED_ENVELOPE_TYPES.includes(c.type) &&
      looksLikeOtherBuilding(c.name)
    )
      flags.push(flag('looks_like_other_building'))

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
    // A type that did not exist when the house was built counts from its
    // earliest year instead (forecastDefaults.earliestYear). A part of another
    // building has no year from the house either: a garage is often built
    // later, so counting it as old as the house would use it up for nothing.
    let installYear: ByScenario
    let basis: PlanBasis = isAssumed ? 'assumed' : 'documented'
    const ownYear =
      numberValue(c.values, 'installation_year', flags) ??
      (defaults.installationYearKey
        ? numberValue(c.values, defaults.installationYearKey, flags)
        : undefined)
    // A part of another building is as old as that building, not the house.
    const buildingYear =
      ownYear === undefined && building
        ? numberValue(building.values, 'installation_year', flags)
        : undefined
    if (buildingYear !== undefined) flags.push(flag('building_year_used'))
    const installed = ownYear ?? buildingYear
    const earliest = defaults.earliestYear ?? -Infinity
    if (installed !== undefined) {
      installYear = byScenario(() => installed)
    } else if (typeof constructionYear === 'number' && !building) {
      const year = Math.max(constructionYear, earliest)
      installYear = byScenario(() => year)
      if (!isAssumed) basis = 'construction_year'
      flags.push(
        year > constructionYear
          ? flag('earliest_year_used', { year })
          : flag('construction_year_used')
      )
    } else {
      installYear = {
        low: startYear,
        typical: Math.max(startYear - Math.round(years.typical / 2), earliest),
        high: Math.max(startYear - years.min, earliest),
      }
      if (!isAssumed) basis = 'unknown_year'
      flags.push(flag('installation_year_unknown'))
    }
    // A partial renovation (new fronts and worktops in a kitchen, new
    // fixtures and surfaces in a bathroom, a new fan in a ventilation unit)
    // renews what wears fastest, not the whole. It gives the part a share of
    // a lifespan from that year, or nothing if its own lifespan runs longer.
    // How old the part was at the time does not count: an old part does not
    // get more out of new fronts than a younger one. The installation year
    // is moved so that the replacement and the debt both follow.
    const partial = numberValue(c.values, 'partial_renovation_year', flags)
    if (partial !== undefined && partial > installYear.typical) {
      const share = defaults.partialRenovationShare ?? PARTIAL_RENOVATION_SHARE
      const counted = byScenario((s) =>
        Math.max(
          installYear[s],
          Math.round(partial - (1 - share) * lifespan[s])
        )
      )
      flags.push(
        counted.typical > installYear.typical
          ? flag('partial_renovation', {
              year: partial,
              percent: Math.round(share * 100),
            })
          : flag('partial_renovation_no_effect', { year: partial })
      )
      installYear = counted
    }

    // Quantity in a profile's unit.
    const quantityIn = (unit: CostUnit, flags: Flag[]): number | null => {
      if (unit === 'HOUSE') return 1
      const key =
        unit === 'M2' ? 'area' : unit === 'LINEAR_M' ? 'length' : 'quantity'
      const own = numberValue(c.values, key, flags)
      if (own !== undefined) return own
      // A per-area estimate stands for the whole house, or for the whole
      // building a part sits under: what the other components of the type
      // do not state is shared among those that state nothing, so listing
      // parts without numbers does not make a house cheaper. A building is
      // taken as one storey, from its own area.
      const size = building && buildingArea(building)
      const sharesWall =
        !!building &&
        valueOf(building.values, 'attached') === true &&
        defaults.quantityFromFootprint?.basis === 'wall'
      if (sharesWall && size && defaults.quantityFromFootprint)
        flags.push(flag('attached_wall_shared'))
      const whole = building
        ? size && defaults.quantityFromFootprint
          ? {
              total:
                fromFootprint(defaults.quantityFromFootprint, size.area, 1) *
                (sharesWall ? ATTACHED_WALL_SHARE : 1),
              fromFootprint: true,
            }
          : null
        : estimate(defaults)
      if (whole) {
        if (!building && whole.fromFootprint && withSecondary)
          flags.push(flag('footprint_includes_secondary_area'))
        const ownShare = valueOf(c.values, 'share')
        if (typeof ownShare === 'number' && ownShare > 0 && ownShare <= 1) {
          flags.push(flag('quantity_by_share', { key, share: ownShare }))
          return ownShare * whole.total
        }
        const { unstated, stated, shares } = quantities(c.type, key, building)
        const share = (whole.total * (1 - shares) - stated) / unstated
        if (unit === 'EACH' ? share >= 1 : share > 0) {
          flags.push(
            building && size
              ? size.assumed
                ? flag('quantity_from_usual_building', {
                    key,
                    building: building.id,
                    area: size.area,
                  })
                : flag('quantity_from_building', { key, area: size.area })
              : whole.fromFootprint
                ? unstated === 1
                  ? flag('quantity_from_footprint', {
                      key,
                      floors: footprintFloors as number,
                    })
                  : flag('quantity_from_footprint_shared', {
                      key,
                      floors: footprintFloors as number,
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
      // A usual size stands in where nothing else can be estimated: a shed
      // or a driveway without an area (forecastDefaults.assumedQuantity), and
      // a smaller one for entrance steps registered as a deck.
      const usual =
        (looksLikeEntrance(c.name) ? defaults.assumedEntranceQuantity : null) ??
        defaults.assumedQuantity
      if (usual !== undefined) {
        flags.push(flag('quantity_assumed', { key, value: usual }))
        return usual
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
        basis,
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
