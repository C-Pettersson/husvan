// What the forecast says about an input it lacks, doubts or guesses, as a
// code with parameters. The web translates the code; the MCP tools send the
// English text, which Claude reads.
type Params = Record<string, string | number>

const ENGLISH = {
  uncertain: (p: Params) => `${p.key} uncertain (confidence ${p.confidence})`,
  assumed_part: () => 'not in the documents; assumed, as every house has one',
  construction_year_used: () =>
    'installation_year missing; construction_year used',
  installation_year_unknown: () =>
    'installation year unknown; range covers the whole lifespan',
  quantity_estimated: (p: Params) => `${p.key} estimated from living_area`,
  quantity_estimated_shared: (p: Params) =>
    `${p.key} estimated from living_area, shared among ${p.count} components`,
  quantity_from_footprint: (p: Params) =>
    `${p.key} estimated from living_area over ${p.floors} floor(s)`,
  quantity_from_footprint_shared: (p: Params) =>
    `${p.key} estimated from living_area over ${p.floors} floor(s), shared among ${p.count} components`,
  quantity_one_assumed: () => 'quantity missing; 1 assumed',
  priced_by_context: (p: Params) =>
    `priced for the house's ${p.key} = ${p.value}`,
  one_of_several: (p: Params) =>
    `the house has ${p.count} of these; while another one works, renewing this one is less urgent`,
  quantity_missing: (p: Params) => `${p.key} missing; no cost`,
  profile_without_cost: () => 'the lifespan profile has no cost',
  last_painted_missing: () =>
    'last_painted_year missing; installation year used',
  overdue_replacement: () =>
    'past its lifespan; replacement put in the start year',
  timed_by_work_item: (p: Params) => `timed by work item: ${p.description}`,
  replacement_not_costed: () => 'replacement not costed',
  cheaper_renewal: (p: Params) =>
    `low and typical renew it as ${p.match}; high replaces it`,
  repaint_overdue: () => 'repaint overdue; put in the start year',
  inspection_added: (p: Params) =>
    `added by Husvan for ${p.count} part(s) without inspected_year; it decides whether and how they are renewed`,
  work_item_no_year: () => 'no year given; put in the start year',
  work_item_before_start: () => 'due before the start year',
  work_item_no_cost: () => 'no cost given',
  trended: (p: Params) => `trended ${p.percent} % a year`,
  no_tariff_changes: () =>
    'no tariff changes for the municipality; no trend applied',
  interest_without_loan: () =>
    'interest_rate set without loan_sek; no capital cost',
  not_inspected: () => 'no inspection protocol: defects are unknown, not none',
  operating_cost_less_parts: () =>
    'the listing’s operating cost less the parts it names',
  heating_no_pellet_price: () => 'heating cost unknown: no price for pellets',
  heating_no_energy_price: () =>
    'heating cost unknown: no energy price for the municipality',
  heating_from_energy_use: (p: Params) =>
    `heating_kwh_per_year × ${p.price} kr/kWh`,
  heating_estimated: (p: Params) =>
    `estimated from energy_performance_kwh_per_m2 × living_area × Fgeo ${p.fgeo} / ${p.weight}: about ${p.kwh} kWh`,
  heating_unknown: () =>
    'heating cost unknown: no cost, energy use or energy class',
  running_costs_unknown: () => 'running costs unknown',
} satisfies Record<string, (p: Params) => string>

export type FlagCode = keyof typeof ENGLISH
export type Flag = { code: FlagCode; params?: Params }

export const flag = (code: FlagCode, params?: Params): Flag =>
  params ? { code, params } : { code }

export const flagText = (f: Flag) => ENGLISH[f.code](f.params ?? {})

export const FLAG_CODES = Object.keys(ENGLISH) as FlagCode[]
