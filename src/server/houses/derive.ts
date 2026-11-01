// What is worked out from a house's current values at read time and never
// stored (CLAUDE.md, "Egenskaper", "Grunden", "Elsystem och rör",
// "Konventioner"). Shared by the web and the MCP tools.
import type { ComponentView, KeyValueView } from './getHouse'

export function valueOf(values: KeyValueView[], key: string): unknown {
  return values.find((v) => v.key === key)?.current.value
}

export function flatten(components: ComponentView[]): ComponentView[] {
  return components.flatMap((c) => [c, ...flatten(c.children)])
}

// Price in the forecast and comparison: final price, else highest bid, else
// asking price. The answer always says which one was used.
const PRICE_KEYS = [
  'final_price_sek',
  'highest_bid_sek',
  'asking_price_sek',
] as const

export type Price = { sek: number; kind: (typeof PRICE_KEYS)[number] } | null

export function pickPrice(houseValues: KeyValueView[]): Price {
  for (const kind of PRICE_KEYS) {
    const sek = valueOf(houseValues, kind)
    if (typeof sek === 'number') return { sek, kind }
  }
  return null
}

export type FeatureAnswer = 'yes' | 'no' | 'unknown'

// What a buyer wants beyond the cost (CLAUDE.md, "Egenskaper"). Basement is
// not a component; it follows from the foundation type.
export const FEATURES = [
  'pool',
  'sauna',
  'deck',
  'sunroom',
  'garage',
  'wood_stove',
  'heat_pump_air_air',
  'basement',
]

// Unknown is not no: yes when an approved component of the type exists, no
// when the house's absent_features names it, otherwise unknown.
export function featureAnswer(
  feature: string,
  components: ComponentView[],
  houseValues: KeyValueView[]
): FeatureAnswer {
  const all = flatten(components)
  const present =
    feature === 'basement'
      ? all.some(
          (c) =>
            c.type === 'foundation' &&
            valueOf(c.values, 'foundation_type') === 'basement'
        )
      : all.some((c) => c.type === feature)
  if (present) return 'yes'
  const absent = valueOf(houseValues, 'absent_features')
  if (Array.isArray(absent) && absent.includes(feature)) return 'no'
  if (feature === 'basement') {
    const foundation = all.find((c) => c.type === 'foundation')
    if (foundation && valueOf(foundation.values, 'foundation_type')) return 'no'
  }
  return 'unknown'
}

export const MAIN_HEATING = [
  'heat_pump_ground',
  'heat_pump_air_water',
  'district_heating_substation',
  'electric_boiler',
  'electric_radiators',
  'pellet_boiler',
]
export const COMPLEMENTARY_HEATING = ['wood_stove', 'heat_pump_air_air']

export function heating(components: ComponentView[]) {
  const types = new Set(flatten(components).map((c) => c.type))
  return {
    main: MAIN_HEATING.filter((t) => types.has(t)),
    complementary: COMPLEMENTARY_HEATING.filter((t) => types.has(t)),
  }
}

export function bathroomCount(components: ComponentView[]) {
  return flatten(components).filter((c) => c.type === 'bathroom').length
}

export type Risk = {
  kind: 'risk_construction' | 'older_electrical'
  componentId: string
  type: string
  reason: string
}

// Foundations whose type and variant are known risk constructions, and
// older electrical systems. Flagged, never turned into kronor beyond the
// replacement cost.
const RISK_FOUNDATIONS: Record<string, [attribute: string, value: string]> = {
  slab_on_ground: ['slab_insulation', 'above'],
  crawl_space: ['crawl_space_ventilation', 'outdoor_air'],
  basement: ['basement_wall_insulation', 'interior'],
}

export function risks(components: ComponentView[]): Risk[] {
  const result: Risk[] = []
  for (const c of flatten(components)) {
    if (c.type === 'foundation') {
      const foundationType = valueOf(c.values, 'foundation_type')
      const rule =
        typeof foundationType === 'string'
          ? RISK_FOUNDATIONS[foundationType]
          : undefined
      if (rule && valueOf(c.values, rule[0]) === rule[1]) {
        result.push({
          kind: 'risk_construction',
          componentId: c.id,
          type: c.type,
          reason: `${foundationType} with ${rule[0]} = ${rule[1]}`,
        })
      }
    }
    if (c.type === 'electrical_installation') {
      const wiring = valueOf(c.values, 'wiring')
      if (wiring === 'cloth_insulated' || wiring === 'two_wire') {
        result.push({
          kind: 'older_electrical',
          componentId: c.id,
          type: c.type,
          reason: `wiring = ${wiring}`,
        })
      }
    }
    if (c.type === 'electrical_panel' && valueOf(c.values, 'rcd') === false) {
      result.push({
        kind: 'older_electrical',
        componentId: c.id,
        type: c.type,
        reason: 'no residual current device (rcd = false)',
      })
    }
  }
  return result
}
