// The type library Husvan starts with (CLAUDE.md, "Komponenttyper från
// start", "Grunden", "Elsystem och rör", "Egenskaper"). The seed upserts these
// rows; attributes added to a type during operation are kept.
//
// forecastDefaults.quantityPerLivingM2 is filled in from the lifespan
// research together with the profiles in lifespanProfiles.mts.
import type {
  AttributeDefinition,
  ComponentTypeDefinition,
} from '../../src/server/library/schema.ts'

type Attributes = Record<string, AttributeDefinition>

const installationYear: Attributes = {
  installation_year: {
    label: { sv: 'Installationsår', en: 'Installation year' },
    datatype: 'year',
  },
}

const condition: Attributes = {
  condition: {
    label: { sv: 'Skick', en: 'Condition' },
    description: {
      sv: '1 till 5, där 5 är nytt',
      en: '1 to 5, where 5 is new',
    },
    datatype: 'number',
    min: 1,
    max: 5,
  },
}

const inspectedYear: Attributes = {
  inspected_year: {
    label: { sv: 'Senast besiktigat', en: 'Last inspected' },
    datatype: 'year',
  },
}

const area: Attributes = {
  area: {
    label: { sv: 'Yta', en: 'Area' },
    datatype: 'number',
    unit: 'm2',
    min: 0,
  },
}

const length: Attributes = {
  length: {
    label: { sv: 'Längd', en: 'Length' },
    datatype: 'number',
    unit: 'm',
    min: 0,
  },
}

const quantity: Attributes = {
  quantity: {
    label: { sv: 'Antal', en: 'Quantity' },
    datatype: 'number',
    min: 1,
  },
}

const modelName: Attributes = {
  model_name: {
    label: { sv: 'Modellnamn', en: 'Model name' },
    datatype: 'text',
  },
}

// Which way it faces, where sun and weather matter: a deck, a sunroom, a
// window registered on its own.
const orientation: Attributes = {
  orientation: choice('Väderstreck', 'Orientation', {
    north: ['Norr', 'North'],
    north_east: ['Nordost', 'North-east'],
    east: ['Öster', 'East'],
    south_east: ['Sydost', 'South-east'],
    south: ['Söder', 'South'],
    south_west: ['Sydväst', 'South-west'],
    west: ['Väster', 'West'],
    north_west: ['Nordväst', 'North-west'],
  }),
}

const capacityKw: Attributes = {
  capacity_kw: {
    label: { sv: 'Effekt', en: 'Output' },
    datatype: 'number',
    unit: 'kW',
    min: 0,
  },
}

// Who installed it and the invoice, as in the underfloor heating example.
const provenance: Attributes = {
  installer: {
    label: { sv: 'Installatör', en: 'Installer' },
    datatype: 'actor',
  },
  purchase: {
    label: { sv: 'Inköp eller faktura', en: 'Purchase or invoice' },
    datatype: 'document',
  },
}

// What a replaceable part has in common.
const replaceable: Attributes = {
  ...installationYear,
  ...condition,
  ...provenance,
}

function choice(
  sv: string,
  en: string,
  options: Record<string, [sv: string, en: string]>
): AttributeDefinition {
  return {
    label: { sv, en },
    datatype: 'choice',
    options: Object.fromEntries(
      Object.entries(options).map(([key, [osv, oen]]) => [
        key,
        { sv: osv, en: oen },
      ])
    ),
  }
}

function yesNo(sv: string, en: string): AttributeDefinition {
  return { label: { sv, en }, datatype: 'boolean' }
}

export const componentTypes: ComponentTypeDefinition[] = [
  // Building envelope ---------------------------------------------------------
  {
    type: 'foundation',
    label: { sv: 'Grund', en: 'Foundation' },
    category: 'envelope',
    // No lifespan profile: the foundation is not replaced. What wears out is
    // the drainage, waterproofing and dehumidifier below it.
    attributeSchema: {
      foundation_type: choice('Grundtyp', 'Foundation type', {
        slab_on_ground: ['Platta på mark', 'Slab on ground'],
        crawl_space: ['Krypgrund', 'Crawl space'],
        basement: ['Källare', 'Basement'],
        plinth: ['Plintgrund', 'Plinth foundation'],
        stone_foundation: ['Torpargrund', 'Stone foundation'],
      }),
      slab_insulation: choice('Isolering av plattan', 'Slab insulation', {
        below: ['Under plattan', 'Below the slab'],
        above: ['Ovanpå plattan', 'Above the slab'],
      }),
      crawl_space_ventilation: choice(
        'Ventilation av krypgrunden',
        'Crawl space ventilation',
        {
          outdoor_air: ['Uteluftsventilerad', 'Ventilated with outdoor air'],
          dehumidified: ['Avfuktad', 'Dehumidified'],
        }
      ),
      basement_wall_insulation: choice(
        'Isolering av källarväggar',
        'Basement wall insulation',
        {
          exterior: ['Utvändig', 'Exterior'],
          interior: ['Invändig', 'Interior'],
        }
      ),
      ...condition,
    },
    allowedSubcomponents: [
      'drainage',
      'foundation_waterproofing',
      'crawl_space_dehumidifier',
    ],
  },
  {
    type: 'drainage',
    label: { sv: 'Dränering', en: 'Drainage' },
    category: 'envelope',
    attributeSchema: { ...replaceable, ...inspectedYear, ...length },
    // Metres of foundation perimeter: an 8 x 10 m foundation is 36 m, and a
    // 1.5-storey house has less perimeter per m2 living area than a 1-storey.
    forecastDefaults: { quantityPerLivingM2: 0.35 },
  },
  {
    type: 'foundation_waterproofing',
    label: { sv: 'Fuktskydd av grund', en: 'Foundation waterproofing' },
    category: 'envelope',
    // Priced per metre of perimeter, like the drainage it is dug up with.
    attributeSchema: { ...replaceable, ...length },
    // Mostly basement houses, where living area spans two floors.
    forecastDefaults: { quantityPerLivingM2: 0.25 },
  },
  {
    type: 'crawl_space_dehumidifier',
    label: { sv: 'Avfuktare i krypgrund', en: 'Crawl space dehumidifier' },
    category: 'envelope',
    attributeSchema: { ...replaceable, ...modelName },
  },
  {
    type: 'roof_covering',
    label: { sv: 'Taktäckning', en: 'Roof covering' },
    category: 'envelope',
    attributeSchema: {
      material: choice('Material', 'Material', {
        concrete_tile: ['Betongpannor', 'Concrete tiles'],
        clay_tile: ['Tegelpannor', 'Clay tiles'],
        sheet_metal: ['Plåt', 'Sheet metal'],
        asphalt_shingle: ['Shingel', 'Asphalt shingles'],
        roofing_felt: ['Papp', 'Roofing felt'],
      }),
      sheet_profile: choice('Plåtprofil', 'Sheet profile', {
        standing_seam: ['Bandtäckt', 'Standing seam'],
        profiled: ['Profilerad', 'Profiled'],
      }),
      ...replaceable,
      ...area,
      ...modelName,
    },
    // Roof area per m2 living area for a 1 to 1.5-storey villa with eaves
    // and a pitch of about 27 degrees; about 0.7 for two storeys. Geometry,
    // not a source.
    forecastDefaults: {
      quantityPerLivingM2: 1.3,
      profileKeyOrder: ['material', 'sheet_profile'],
    },
  },
  {
    type: 'facade',
    label: { sv: 'Fasad', en: 'Facade' },
    category: 'envelope',
    attributeSchema: {
      material: choice('Material', 'Material', {
        wood_panel: ['Träpanel', 'Wood panel'],
        render: ['Puts', 'Render'],
        brick: ['Tegel', 'Brick'],
        fibre_cement: ['Fibercement', 'Fibre cement'],
        sheet_metal: ['Plåt', 'Sheet metal'],
      }),
      ...replaceable,
      ...area,
      ...modelName,
    },
    // Wall area less openings for a 1-storey 9 x 15 m house is about 125 m2
    // for 120 m2 living area.
    forecastDefaults: { quantityPerLivingM2: 1.0 },
  },
  {
    type: 'window',
    label: { sv: 'Fönster', en: 'Window' },
    category: 'envelope',
    // One row per window when the documents allow it, otherwise one row with
    // quantity (CLAUDE.md).
    attributeSchema: {
      frame_material: choice('Karmmaterial', 'Frame material', {
        wood: ['Trä', 'Wood'],
        wood_aluminium: ['Trä och aluminium', 'Wood and aluminium'],
        pvc: ['PVC', 'PVC'],
        aluminium: ['Aluminium', 'Aluminium'],
      }),
      glazing: choice('Glas', 'Glazing', {
        single: ['Enkelglas', 'Single glazing'],
        double: ['Tvåglas', 'Double glazing'],
        triple: ['Treglas', 'Triple glazing'],
      }),
      u_value: {
        label: { sv: 'U-värde', en: 'U-value' },
        datatype: 'number',
        unit: 'W/m2K',
        min: 0,
      },
      ...quantity,
      ...replaceable,
      ...modelName,
      ...orientation,
    },
    // Windows per m2 living area: glass at least 10 % of floor area (BBR
    // 6:322) with windows of about 1.2 m2 and 75 % glass, about 14 windows
    // for 130 m2.
    forecastDefaults: { quantityPerLivingM2: 0.11 },
  },
  {
    type: 'exterior_door',
    label: { sv: 'Ytterdörr', en: 'Exterior door' },
    category: 'envelope',
    attributeSchema: { ...quantity, ...replaceable, ...modelName },
  },

  // Heating -------------------------------------------------------------------
  {
    type: 'heat_pump_air_water',
    label: { sv: 'Luft-vattenvärmepump', en: 'Air-to-water heat pump' },
    category: 'heating',
    attributeSchema: { ...replaceable, ...modelName, ...capacityKw },
  },
  {
    type: 'heat_pump_ground',
    label: { sv: 'Bergvärmepump', en: 'Ground source heat pump' },
    category: 'heating',
    attributeSchema: {
      ...replaceable,
      ...modelName,
      ...capacityKw,
      borehole_depth_m: {
        label: { sv: 'Borrhålsdjup', en: 'Borehole depth' },
        datatype: 'number',
        unit: 'm',
        min: 0,
      },
    },
  },
  {
    type: 'heat_pump_air_air',
    label: { sv: 'Luft-luftvärmepump', en: 'Air-to-air heat pump' },
    category: 'heating',
    attributeSchema: { ...replaceable, ...modelName, ...quantity },
  },
  {
    type: 'district_heating_substation',
    label: { sv: 'Fjärrvärmecentral', en: 'District heating substation' },
    category: 'heating',
    attributeSchema: { ...replaceable, ...modelName },
  },
  {
    type: 'electric_boiler',
    label: { sv: 'Elpanna', en: 'Electric boiler' },
    category: 'heating',
    attributeSchema: { ...replaceable, ...modelName, ...capacityKw },
  },
  {
    type: 'electric_radiators',
    label: { sv: 'Direktverkande el', en: 'Electric radiators' },
    category: 'heating',
    attributeSchema: { ...replaceable, ...quantity },
  },
  {
    type: 'pellet_boiler',
    label: { sv: 'Pelletspanna', en: 'Pellet boiler' },
    category: 'heating',
    attributeSchema: { ...replaceable, ...modelName, ...capacityKw },
  },
  {
    type: 'wood_stove',
    label: { sv: 'Kamin', en: 'Wood stove' },
    category: 'heating',
    attributeSchema: { ...replaceable, ...modelName },
  },
  {
    type: 'chimney',
    label: { sv: 'Skorsten', en: 'Chimney' },
    category: 'heating',
    attributeSchema: {
      material: choice('Material', 'Material', {
        brick: ['Murad', 'Brick'],
        steel: ['Stål', 'Steel'],
      }),
      // A renovated flue is a new chimney component with replacesId, like a
      // relined sewer pipe.
      renovation_method: choice('Renovering av rökkanal', 'Flue renovation', {
        relined: ['Insatsrör', 'Relined with a liner'],
        slip_cast: ['Ingjuten', 'Slip cast'],
      }),
      ...replaceable,
      ...inspectedYear,
    },
  },
  {
    type: 'underfloor_heating',
    label: { sv: 'Golvvärme', en: 'Underfloor heating' },
    category: 'heating',
    attributeSchema: {
      medium: choice('El eller vatten', 'Electric or water', {
        electric: ['El', 'Electric'],
        water: ['Vatten', 'Water'],
      }),
      ...replaceable,
      ...area,
      ...modelName,
    },
  },

  // Ventilation ---------------------------------------------------------------
  {
    type: 'ventilation_ftx',
    label: {
      sv: 'FTX-ventilation',
      en: 'Balanced ventilation with heat recovery',
    },
    category: 'ventilation',
    attributeSchema: { ...replaceable, ...modelName },
  },
  {
    type: 'ventilation_exhaust',
    label: { sv: 'Frånluftsventilation', en: 'Exhaust ventilation' },
    category: 'ventilation',
    attributeSchema: { ...replaceable, ...modelName },
  },

  // Plumbing ------------------------------------------------------------------
  {
    type: 'water_heater',
    label: { sv: 'Varmvattenberedare', en: 'Water heater' },
    category: 'plumbing',
    attributeSchema: {
      ...replaceable,
      ...modelName,
      volume_l: {
        label: { sv: 'Volym', en: 'Volume' },
        datatype: 'number',
        unit: 'l',
        min: 0,
      },
    },
  },
  {
    type: 'water_pipes',
    label: { sv: 'Vattenledningar', en: 'Water pipes' },
    category: 'plumbing',
    attributeSchema: {
      material: choice('Material', 'Material', {
        copper: ['Koppar', 'Copper'],
        galvanized_steel: ['Galvaniserat stål', 'Galvanized steel'],
        pex: ['PEX', 'PEX'],
        composite: ['Komposit', 'Composite'],
      }),
      ...replaceable,
      ...inspectedYear,
    },
  },
  {
    type: 'sewer_pipes',
    label: { sv: 'Avloppsledningar', en: 'Sewer pipes' },
    category: 'plumbing',
    // One component per section, since they age differently (CLAUDE.md).
    attributeSchema: {
      material: choice('Material', 'Material', {
        cast_iron: ['Gjutjärn', 'Cast iron'],
        plastic: ['Plast', 'Plastic'],
        early_plastic: [
          'Tidig plast (cirka 1960–1975)',
          'Early plastic (about 1960–1975)',
        ],
        concrete: ['Betong', 'Concrete'],
        clay: ['Lera', 'Clay'],
      }),
      section: choice('Sträcka', 'Section', {
        indoor: ['Inomhus', 'Indoor'],
        under_slab: ['Under grundplattan', 'Under the slab'],
        ground: [
          'I mark till förbindelsepunkten',
          'In the ground to the connection point',
        ],
      }),
      renovation_method: choice('Renoveringsmetod', 'Renovation method', {
        replaced: ['Bytt', 'Replaced'],
        relined: ['Relinat', 'Relined'],
      }),
      ...replaceable,
      ...inspectedYear,
      ...length,
    },
    // A relined pipe keeps its old material but ages as its liner, and a
    // ground section costs more than an indoor one of the same material.
    forecastDefaults: {
      profileKeyOrder: ['renovation_method', 'material', 'section'],
    },
  },

  // Electrical ----------------------------------------------------------------
  {
    type: 'electrical_installation',
    label: { sv: 'Elinstallation', en: 'Electrical installation' },
    category: 'electrical',
    attributeSchema: {
      wiring: choice('Ledningar', 'Wiring', {
        cloth_insulated: ['Tygisolerade', 'Cloth insulated'],
        two_wire: ['Ojordat tvåledarsystem', 'Ungrounded two-wire'],
        grounded: ['Jordat', 'Grounded'],
      }),
      ...replaceable,
      ...inspectedYear,
    },
    allowedSubcomponents: ['electrical_panel'],
    // Rewiring is priced per m2 living area.
    forecastDefaults: { quantityPerLivingM2: 1.0 },
  },
  {
    type: 'electrical_panel',
    label: { sv: 'Elcentral', en: 'Electrical panel' },
    category: 'electrical',
    attributeSchema: {
      panel_type: choice('Typ', 'Type', {
        fuses: ['Proppskåp', 'Fuses'],
        circuit_breakers: ['Automatsäkringar', 'Circuit breakers'],
      }),
      rcd: yesNo('Jordfelsbrytare', 'Residual current device'),
      main_fuse_a: {
        label: { sv: 'Huvudsäkring', en: 'Main fuse' },
        datatype: 'number',
        unit: 'A',
        min: 0,
      },
      ...replaceable,
    },
  },

  // Interior ------------------------------------------------------------------
  {
    type: 'kitchen',
    label: { sv: 'Kök', en: 'Kitchen' },
    category: 'interior',
    attributeSchema: { ...replaceable, ...modelName },
  },
  {
    type: 'bathroom',
    label: { sv: 'Badrum', en: 'Bathroom' },
    category: 'interior',
    // Bathrooms are counted, not stored: "2 badrum" becomes two components.
    attributeSchema: {
      ...replaceable,
      ...area,
      wet_room_certified: yesNo('Våtrumsintyg', 'Wet room certificate'),
    },
    allowedSubcomponents: ['underfloor_heating'],
  },
  {
    type: 'garage_door',
    label: { sv: 'Garageport', en: 'Garage door' },
    category: 'interior',
    attributeSchema: { ...replaceable, ...modelName },
  },

  // Features, without a lifespan profile in version 1 -------------------------
  {
    type: 'pool',
    label: { sv: 'Pool', en: 'Pool' },
    category: 'feature',
    attributeSchema: {
      pool_type: choice('Typ', 'Type', {
        in_ground: ['Nedgrävd', 'In-ground'],
        above_ground: ['Ovan mark', 'Above ground'],
      }),
      heated: yesNo('Uppvärmd', 'Heated'),
      ...installationYear,
      ...condition,
      ...orientation,
    },
  },
  {
    type: 'sauna',
    label: { sv: 'Bastu', en: 'Sauna' },
    category: 'feature',
    attributeSchema: {
      heating: choice('Aggregat', 'Heater', {
        electric: ['El', 'Electric'],
        wood: ['Ved', 'Wood'],
      }),
      ...installationYear,
      ...condition,
    },
  },
  {
    type: 'deck',
    label: { sv: 'Altan', en: 'Deck' },
    category: 'feature',
    attributeSchema: {
      glazing: choice('Inglasning', 'Glazing', {
        open: ['Öppen', 'Open'],
        glazed: ['Inglasad', 'Glazed'],
      }),
      ...area,
      ...installationYear,
      ...condition,
      ...orientation,
    },
  },
  {
    type: 'sunroom',
    label: { sv: 'Uterum', en: 'Sunroom' },
    category: 'feature',
    attributeSchema: {
      insulated: yesNo('Isolerat', 'Insulated'),
      ...area,
      ...installationYear,
      ...condition,
      ...orientation,
    },
  },
  {
    type: 'garage',
    label: { sv: 'Garage', en: 'Garage' },
    category: 'feature',
    attributeSchema: {
      capacity: {
        label: { sv: 'Bilplatser', en: 'Parking spaces' },
        datatype: 'number',
        min: 1,
      },
      attached: yesNo('Sammanbyggt med huset', 'Attached to the house'),
      ...installationYear,
      ...condition,
    },
    allowedSubcomponents: ['garage_door'],
  },
]
