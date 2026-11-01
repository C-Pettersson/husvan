// Keys for observations on the house itself (componentId null), from
// CLAUDE.md, "Konventioner". Not in the database: the type library covers
// components, and these keys are what Claude should look for on the house.
// Like the attribute schema, the list says what to look for and does not
// limit what may be stored.
export type HouseKey = {
  description: string
  datatype: 'text' | 'number' | 'year' | 'date' | 'boolean' | 'choice' | 'list'
  unit?: string
  options?: string[]
}

export const HOUSE_KEYS: Record<string, HouseKey> = {
  // Purchase
  asking_price_sek: {
    description: 'Asking price',
    datatype: 'number',
    unit: 'SEK',
  },
  highest_bid_sek: {
    description: 'Highest bid so far',
    datatype: 'number',
    unit: 'SEK',
  },
  highest_bid_date: {
    description: 'Date of the highest bid',
    datatype: 'date',
  },
  final_price_sek: {
    description: 'Final price',
    datatype: 'number',
    unit: 'SEK',
  },
  sale_status: {
    description:
      'State of the sale, from the listing or the agent. Separate from the house status, which is the owner’s decision',
    datatype: 'choice',
    options: ['upcoming', 'bidding', 'closed'],
  },
  sale_date: { description: 'Date the house was sold', datatype: 'date' },
  assessed_value_sek: {
    description: 'Tax assessment value (taxeringsvärde)',
    datatype: 'number',
    unit: 'SEK',
  },
  assessed_building_value_sek: {
    description: 'Building part of the assessment value',
    datatype: 'number',
    unit: 'SEK',
  },
  assessment_year: {
    description: 'Year of the tax assessment',
    datatype: 'year',
  },
  property_fee_sek_per_year: {
    description: 'Municipal property fee (fastighetsavgift)',
    datatype: 'number',
    unit: 'SEK',
  },

  // The building
  house_type: {
    description: 'Kind of house',
    datatype: 'choice',
    options: ['detached', 'semi_detached', 'terraced', 'linked'],
  },
  tenure: {
    description: 'Tenure (upplåtelseform)',
    datatype: 'choice',
    options: ['freehold', 'site_leasehold'],
  },
  construction_year: {
    description:
      'Year built. The default installation year for components without one',
    datatype: 'year',
  },
  living_area: {
    description: 'Living area (boarea)',
    datatype: 'number',
    unit: 'm2',
  },
  secondary_area: {
    description: 'Secondary area (biarea)',
    datatype: 'number',
    unit: 'm2',
  },
  plot_area: {
    description: 'Plot area (tomtarea)',
    datatype: 'number',
    unit: 'm2',
  },
  room_count: { description: 'Number of rooms', datatype: 'number' },
  bedroom_count: { description: 'Number of bedrooms', datatype: 'number' },
  floor_count: { description: 'Number of floors', datatype: 'number' },
  ventilation_type: {
    description:
      'Ventilation without a component of its own, such as natural draught',
    datatype: 'choice',
    options: ['natural_draft'],
  },
  // Radon in indoor air. The reference level for homes is 200 Bq/m3
  // (Strålsäkerhetsmyndigheten); a measured level above it is flagged.
  radon_bq_m3: {
    description:
      'Measured radon level in indoor air, the annual mean the report states',
    datatype: 'number',
    unit: 'Bq/m3',
  },
  radon_measurement_year: {
    description: 'Year of the radon measurement',
    datatype: 'year',
  },
  radon_measured: {
    description:
      'Whether radon has been measured. false only when a document says it has not been; not mentioned is unknown',
    datatype: 'boolean',
  },
  absent_features: {
    description:
      'Component types the house explicitly lacks, e.g. ["pool", "garage"]. Only what a document says is missing; not mentioned is unknown, not absent',
    datatype: 'list',
  },

  // Energy and running costs
  energy_class: {
    description: 'Energy class from the energy certificate',
    datatype: 'choice',
    options: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  },
  energy_performance_kwh_per_m2: {
    description: 'Primary energy number (primärenergital)',
    datatype: 'number',
    unit: 'kWh/m2',
  },
  energy_declaration_year: {
    description: 'Year of the energy certificate',
    datatype: 'year',
  },
  heating_kwh_per_year: {
    description: 'Energy used for heating per year',
    datatype: 'number',
    unit: 'kWh',
  },
  electricity_kwh_per_year: {
    description: 'Electricity used per year',
    datatype: 'number',
    unit: 'kWh',
  },
  operating_cost_sek_per_year: {
    description: 'Total running cost per year as the listing states it',
    datatype: 'number',
    unit: 'SEK',
  },
  heating_cost_sek_per_year: {
    description: 'Heating cost per year',
    datatype: 'number',
    unit: 'SEK',
  },
  household_electricity_cost_sek_per_year: {
    description: 'Electricity cost per year',
    datatype: 'number',
    unit: 'SEK',
  },
  water_sewage_cost_sek_per_year: {
    description: 'Water and sewage per year',
    datatype: 'number',
    unit: 'SEK',
  },
  waste_cost_sek_per_year: {
    description: 'Waste collection per year',
    datatype: 'number',
    unit: 'SEK',
  },

  // The area
  deso_code: {
    description: 'SCB DeSO 2025 code without suffix, e.g. 2580C1140',
    datatype: 'text',
  },
  police_area_code: {
    description: 'Local police area, e.g. lulea-boden',
    datatype: 'text',
  },
}
