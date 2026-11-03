// What the forecast says about an input it lacks, doubts or guesses, as a
// code with parameters. The web translates the code; the MCP tools send the
// English text, which Claude reads.
type Params = Record<string, string | number>

const ENGLISH = {
  uncertain: (p: Params) => `${p.key} uncertain (confidence ${p.confidence})`,
  assumed_part: () => 'not in the documents; assumed, as every house has one',
  construction_year_used: () =>
    'installation_year missing; construction_year used',
  earliest_year_used: (p: Params) =>
    `installation_year missing; the type did not exist when the house was built, so it counts from ${p.year}`,
  partial_renovation: (p: Params) =>
    `partly renovated in ${p.year}; counted as half as old since then, since the frame, membrane or ducts were not renewed`,
  profile_default_used: (p: Params) =>
    `${p.keys} unknown; the type's default profile with its wide range is used`,
  quantity_by_share: (p: Params) =>
    `${p.key} as share ${p.share} of the house's estimated whole`,
  quantity_assumed: (p: Params) =>
    `${p.key} missing; a usual ${p.value} assumed`,
  footprint_includes_secondary_area: () =>
    'footprint from living and secondary area over one floor more, since the house has a basement',
  looks_like_other_building: () =>
    'by its name this belongs to a garage or an outbuilding but sits at top level, so it takes a share of the house’s estimated area; register it under that building with its own area',
  finding_without_severity: () =>
    'the inspection noted this part without a severity; counted as seen, but how serious it is is unknown',
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
    'past its lifespan and flagged as serious by the inspection; replaced in the start year',
  overdue_seen_ok: () =>
    'past its lifespan, but the inspection saw it without a serious finding; given part of a lifespan more',
  overdue_unjudged: () =>
    'past its lifespan and not judged by an inspection; replaced within the coming years, in high at once',
  timed_by_work_item: (p: Params) => `timed by work item: ${p.description}`,
  replacement_not_costed: () => 'replacement not costed',
  cheaper_renewal: (p: Params) =>
    `low and typical renew it as ${p.match}; high replaces it`,
  repaint_overdue: () => 'repaint overdue; put in the start year',
  inspection_added: (p: Params) =>
    `added by Husvan for ${p.count} part(s) without inspected_year; it decides whether and how they are renewed`,
  work_item_no_year: () => 'no year or severity given; put in the start year',
  work_item_timed_by_severity: (p: Params) =>
    `no year given; spread over ${p.years} year(s) by its severity ${p.severity}`,
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
  scenarios_cross: () =>
    'low, typical and high are whole paths with their own replacement years, and a replacement resets the repainting, so this item’s range is not ordered; the house totals are',
  ground_rent_revised: (p: Params) =>
    `ground rent is revised in ${p.year}; the same amount is kept after that but is uncertain`,
  ground_rent_no_revision_year: () =>
    'ground_rent_revision_year missing; the rent may be revised within the horizon, so it is uncertain throughout',
} satisfies Record<string, (p: Params) => string>

export type FlagCode = keyof typeof ENGLISH
export type Flag = { code: FlagCode; params?: Params }

export const flag = (code: FlagCode, params?: Params): Flag =>
  params ? { code, params } : { code }

export const flagText = (f: Flag) => ENGLISH[f.code](f.params ?? {})

export const FLAG_CODES = Object.keys(ENGLISH) as FlagCode[]
