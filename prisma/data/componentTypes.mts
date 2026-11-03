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
import {
  facadeRepaintByPaintType,
  joineryRepaintByPaintType,
} from './repaint.mts'

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

// A renovation of the parts that wear fastest (kitchen fronts and worktops,
// bathroom fixtures and surfaces without a new membrane, the fan of a
// ventilation unit). The forecast counts the part as half as old since then;
// installation_year stays the year the whole was built or last fully
// renovated (CLAUDE.md, "Regler för beräkningen").
const partialRenovation: Attributes = {
  partial_renovation_year: {
    label: { sv: 'Delrenoverad år', en: 'Partly renovated' },
    description: {
      sv: 'Året för en delrenovering (nya luckor och bänkskivor, nytt porslin och ytskikt utan nytt tätskikt); installationsåret ändras inte',
      en: 'Year of a partial renovation (new fronts and worktops, new fixtures and surfaces without a new membrane); the installation year stays',
    },
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

// Painted wood needs repainting every 8 to 15 years, far more often than it
// is replaced, so the paint has its own year apart from installation_year.
// The forecast repaints from last_painted_year at the interval of the
// profile, or of the paint type when it is known.
const paint: Attributes = {
  last_painted_year: {
    label: { sv: 'Senast målad', en: 'Last painted' },
    description: {
      sv: 'Året ytan senast målades om, för målat trä',
      en: 'Year the surface was last repainted, for painted wood',
    },
    datatype: 'year',
  },
  paint_type: choice('Färgtyp', 'Paint type', {
    linseed_oil: ['Linoljefärg', 'Linseed oil paint'],
    alkyd_oil: ['Alkydoljefärg', 'Alkyd oil paint'],
    acrylic: ['Akrylat- eller latexfärg', 'Acrylic or latex paint'],
    slurry_paint: [
      'Slamfärg, t.ex. Falu Rödfärg',
      'Slurry paint, e.g. Falu red',
    ],
    stain: ['Lasyr', 'Stain'],
  }),
  paint_product: {
    label: { sv: 'Färgprodukt', en: 'Paint product' },
    description: {
      sv: 'Tillverkare och produkt, t.ex. Alcro Bestå Utsikt',
      en: 'Maker and product, e.g. Alcro Bestå Utsikt',
    },
    datatype: 'text',
  },
  paint_colour: {
    label: { sv: 'Kulör', en: 'Colour' },
    description: {
      sv: 'Kulörkod eller namn, t.ex. NCS S 0502-Y',
      en: 'Colour code or name, e.g. NCS S 0502-Y',
    },
    datatype: 'text',
  },
  painted_by: {
    label: { sv: 'Målad av', en: 'Painted by' },
    datatype: 'actor',
  },
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
    // 1.5-storey house has less perimeter per m2 living area than a 1-storey,
    // so the footprint's perimeter is used when floor_count is known.
    // Priced by the foundation type: a basement is dug deeper. A plinth or
    // stone foundation is not assumed to have drainage (Villaägarna: for a
    // torpargrund, drainage is seldom the answer).
    forecastDefaults: {
      assumeUndocumented: true,
      quantityPerLivingM2: 0.35,
      quantityFromFootprint: { basis: 'perimeter', factor: 1 },
      context: { foundation_type: 'foundation' },
      assumeUnless: { foundation_type: ['plinth', 'stone_foundation'] },
      profileKeyOrder: ['foundation_type'],
    },
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
  // An established remedy for mouldy crawl spaces by the mid-2000s
  // (Fuktcentrum LTH, Bygg & teknik 8/06); no source dates the first units,
  // so the strictly sourced 2000 is used.
  {
    type: 'crawl_space_dehumidifier',
    label: { sv: 'Avfuktare i krypgrund', en: 'Crawl space dehumidifier' },
    category: 'envelope',
    attributeSchema: { ...replaceable, ...modelName },
    forecastDefaults: { earliestYear: 2000 },
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
      assumeUndocumented: true,
      quantityPerLivingM2: 1.3,
      // A pitched roof with eaves covers about 1.3 times the footprint.
      quantityFromFootprint: { basis: 'area', factor: 1.3 },
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
      // A mixed facade is several facade components, one per material, each
      // with its own area. Without areas, share says how the house's
      // estimated wall area is split (brick 0.7, wood 0.3) instead of
      // equally (type_library conventions).
      share: {
        label: { sv: 'Andel av fasaden', en: 'Share of the facade' },
        description: {
          sv: 'Andel 0–1 av husets fasadyta när ytan saknas, för en blandad fasad',
          en: 'Share 0–1 of the house’s wall area when the area is missing, for a mixed facade',
        },
        datatype: 'number',
        min: 0,
        max: 1,
      },
      ...modelName,
      ...paint,
    },
    // Wall area less openings for a 1-storey 9 x 15 m house is about 125 m2
    // for 120 m2 living area.
    forecastDefaults: {
      assumeUndocumented: true,
      quantityPerLivingM2: 1.0,
      // Perimeter times floors times 2.7 m, wall and gables less windows;
      // chosen so a one-storey house keeps about 1 m2 per m2 living area.
      quantityFromFootprint: { basis: 'wall', factor: 2.7 },
      repaintByPaintType: facadeRepaintByPaintType,
    },
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
      ...paint,
    },
    // Windows per m2 living area: glass at least 10 % of floor area (BBR
    // 6:322) with windows of about 1.2 m2 and 75 % glass, about 14 windows
    // for 130 m2.
    forecastDefaults: {
      assumeUndocumented: true,
      quantityPerLivingM2: 0.11,
      repaintByPaintType: joineryRepaintByPaintType,
    },
  },
  {
    type: 'roof_drainage',
    label: { sv: 'Takavvattning', en: 'Roof drainage' },
    category: 'envelope',
    // Gutters and downpipes (hängrännor och stuprör), replaced more often
    // than the roof. A heating cable in them is common in the north.
    attributeSchema: {
      material: choice('Material', 'Material', {
        galvanized_steel: ['Galvaniserad plåt', 'Galvanized steel'],
        coated_steel: ['Lackerad plåt', 'Coated steel'],
        aluminium: ['Aluminium', 'Aluminium'],
        copper: ['Koppar', 'Copper'],
        plastic: ['Plast', 'Plastic'],
      }),
      heating_cable: yesNo('Värmekabel', 'Heating cable'),
      ...replaceable,
      ...length,
    },
    // Metres of gutter and downpipe: the two eaves of a gable roof are half
    // the perimeter, and four downpipes of about 2.7 m add a quarter more.
    // For 120 m2 living area on one floor that is about 38 m.
    forecastDefaults: {
      assumeUndocumented: true,
      quantityPerLivingM2: 0.3,
      quantityFromFootprint: { basis: 'perimeter', factor: 0.85 },
    },
  },
  {
    type: 'exterior_door',
    label: { sv: 'Ytterdörr', en: 'Exterior door' },
    category: 'envelope',
    attributeSchema: {
      material: choice('Material', 'Material', {
        wood: ['Trä', 'Wood'],
        steel: ['Stål', 'Steel'],
        aluminium: ['Aluminium', 'Aluminium'],
        composite: ['Komposit', 'Composite'],
      }),
      ...quantity,
      ...replaceable,
      ...modelName,
      ...paint,
    },
    forecastDefaults: {
      assumeUndocumented: true,
      repaintByPaintType: joineryRepaintByPaintType,
    },
  },
  {
    type: 'attic',
    label: { sv: 'Vind', en: 'Attic' },
    category: 'envelope',
    // What wears out on an attic is the insulation: its profile is a new
    // layer of loose fill per m2 of attic floor, counted from the year it
    // was last added (additional_insulation_year stands in for
    // installation_year). Thin insulation explains a high heating cost, and
    // the attic is where the inspector most often finds moisture and mould.
    attributeSchema: {
      attic_type: choice('Typ', 'Type', {
        cold: ['Kallvind', 'Cold attic'],
        partly_finished: ['Delvis inredd', 'Partly finished'],
        finished: ['Inredd vind', 'Finished'],
      }),
      insulation_material: choice('Isolering', 'Insulation', {
        mineral_wool: ['Mineralull, skivor', 'Mineral wool batts'],
        loose_fill_mineral: ['Lösull, mineral', 'Loose-fill mineral wool'],
        cellulose: ['Cellulosa', 'Cellulose'],
        wood_shavings: ['Kutterspån eller sågspån', 'Wood shavings or sawdust'],
      }),
      insulation_thickness_mm: {
        label: { sv: 'Isolertjocklek', en: 'Insulation thickness' },
        datatype: 'number',
        unit: 'mm',
        min: 0,
      },
      additional_insulation_year: {
        label: { sv: 'Tilläggsisolerad år', en: 'Additional insulation' },
        datatype: 'year',
      },
      ...area,
      ...condition,
      ...inspectedYear,
      ...provenance,
    },
    // The attic floor is the footprint; a storey under the roof leaves less.
    forecastDefaults: {
      installationYearKey: 'additional_insulation_year',
      quantityPerLivingM2: 0.8,
      quantityFromFootprint: { basis: 'area', factor: 1 },
    },
  },
  {
    type: 'roof_safety',
    label: { sv: 'Taksäkerhet', en: 'Roof safety' },
    category: 'envelope',
    // Required for chimney sweeping and the fire safety inspection, and a
    // common remark from the sweep. Snow guards over entrances matter where
    // the snow is heavy.
    attributeSchema: {
      wall_ladder: yesNo('Väggstege', 'Wall ladder'),
      roof_ladder: yesNo('Takstege', 'Roof ladder'),
      roof_walkway: yesNo('Gångbrygga', 'Roof walkway'),
      snow_guard: yesNo('Snörasskydd', 'Snow guard'),
      ...replaceable,
      ...inspectedYear,
    },
  },

  // Heating -------------------------------------------------------------------
  // earliestYear: a part without installation_year in an older house counts
  // from the type's first years in Swedish villas, not the construction
  // year. Years and sources (researched 2026-11-03): outdoor-air heat pumps
  // for hydronic systems were sold in the Swedish heat pump boom of
  // 1979-1985 (Fehrm 1993, https://iifiir.org/en/fridoc/exhaust-air-heat-pumps-experiences-12201;
  // IEA HPT Sweden market report 2025).
  {
    type: 'heat_pump_air_water',
    label: { sv: 'Luft-vattenvärmepump', en: 'Air-to-water heat pump' },
    category: 'heating',
    attributeSchema: { ...replaceable, ...modelName, ...capacityKw },
    forecastDefaults: { earliestYear: 1980 },
  },
  // Rock, ground loop or lake: the same heat pump with a different
  // collector, so one type. IVT built Sweden's first bergvärmepump in 1977
  // (Tekniska museet, https://digitaltmuseum.se/021026362462/borrkrona).
  {
    type: 'heat_pump_ground',
    label: {
      sv: 'Berg- eller jordvärmepump',
      en: 'Ground source heat pump',
    },
    category: 'heating',
    attributeSchema: {
      collector_type: choice('Kollektor', 'Collector', {
        borehole: ['Borrhål (bergvärme)', 'Borehole (rock)'],
        surface_ground: ['Ytjordvärme', 'Horizontal ground loop'],
        lake: ['Sjövärme', 'Lake'],
      }),
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
    forecastDefaults: { earliestYear: 1977 },
  },
  // About 15 000 air-to-air units had been installed in Sweden by the end of
  // 1989, 6 000 of them that year (Byggforskningsrådet R60:1990,
  // https://aivc.org/sites/default/files/airbase_5541.pdf), so sales began
  // in the mid-1980s.
  {
    type: 'heat_pump_air_air',
    label: { sv: 'Luft-luftvärmepump', en: 'Air-to-air heat pump' },
    category: 'heating',
    attributeSchema: { ...replaceable, ...modelName, ...quantity },
    forecastDefaults: { earliestYear: 1985 },
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
  // A central air-handling unit with an electric coil that heats the house
  // through ducts, "mycket vanlig" in houses from 1980-1992 (Swegon, Varför
  // FTX) and built on the FT systems of the early 1970s (SFV, Ventilation i
  // äldre byggnader 2009). Replaced like for like; converting to water-borne
  // heating is a work item.
  {
    type: 'electric_air_heating',
    label: { sv: 'Luftburen elvärme', en: 'Air-borne electric heating' },
    category: 'heating',
    attributeSchema: { ...replaceable, ...modelName, ...capacityKw },
    forecastDefaults: { earliestYear: 1975 },
  },
  // The electric heating coil (elbatteri, eftervärmare) in a ventilation
  // unit. When it is the house's heat source, it is the part that costs to
  // replace; registered under the ventilation unit it sits in. Beside
  // another main heat source it is not listed as one (derive.ts, heating).
  // As old as FTX at the earliest.
  {
    type: 'electric_duct_heater',
    label: {
      sv: 'Elbatteri i ventilationen',
      en: 'Electric duct heater',
    },
    category: 'heating',
    attributeSchema: { ...replaceable, ...modelName, ...capacityKw },
    forecastDefaults: { earliestYear: 1975 },
  },
  // Pellet factories from the early 1980s, a villa market from the mid-1990s
  // (Chalmers, Wood pellets as a small-scale biofuel,
  // https://publications.lib.chalmers.se/records/fulltext/5788.pdf).
  {
    type: 'pellet_boiler',
    label: { sv: 'Pelletspanna', en: 'Pellet boiler' },
    category: 'heating',
    attributeSchema: { ...replaceable, ...modelName, ...capacityKw },
    forecastDefaults: { earliestYear: 1990 },
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
    // A stove or a pellet boiler needs a flue: a house with one and no
    // documented chimney is assumed to have one from the construction year.
    forecastDefaults: {
      assumeUndocumented: true,
      assumeWhenTypes: ['wood_stove', 'pellet_boiler'],
    },
  },
  {
    type: 'hydronic_radiators',
    label: { sv: 'Vattenburna radiatorer', en: 'Hydronic radiators' },
    category: 'heating',
    // The system that distributes the heat, apart from the source: it
    // decides whether an air-to-water or ground source heat pump can be
    // installed. An open expansion vessel in the attic is a common remark;
    // changing to a closed one is a work item.
    attributeSchema: {
      pipe_system: choice('Rörsystem', 'Pipe system', {
        two_pipe: ['Tvårörssystem', 'Two-pipe'],
        one_pipe: ['Enrörssystem', 'One-pipe'],
      }),
      pipe_material: choice('Rörmaterial', 'Pipe material', {
        copper: ['Koppar', 'Copper'],
        steel: ['Stål', 'Steel'],
        pex: ['PEX', 'PEX'],
        composite: ['Komposit', 'Composite'],
      }),
      expansion_vessel: choice('Expansionskärl', 'Expansion vessel', {
        open: ['Öppet', 'Open'],
        closed: ['Slutet', 'Closed'],
      }),
      ...quantity,
      ...replaceable,
    },
    // Radiators per m2 living area: the price guides count 10 to 12 in a
    // villa of 120 to 150 m2 (Rörfiness, Brabyggfirmor 2026). A house with a
    // water-borne heat source distributes the heat somehow: radiators are
    // assumed unless water underfloor heating is registered at top level
    // (floor heating under a bathroom is that room's) or the heat is
    // electric at the radiators.
    forecastDefaults: {
      quantityPerLivingM2: 0.08,
      assumeUndocumented: true,
      assumeWhenTypes: [
        'district_heating_substation',
        'heat_pump_ground',
        'heat_pump_air_water',
        'pellet_boiler',
        'electric_boiler',
      ],
      assumeUnlessParts: [
        { type: 'underfloor_heating', where: { medium: ['water'] } },
        { type: 'electric_radiators' },
        { type: 'electric_air_heating' },
      ],
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
  // About 40 000 FTX units stood in Swedish småhus by 1980, after SBN 75
  // (Gezelius, VVS 1980:1, https://www.aivc.org/node/14028; SFV,
  // Ventilation i äldre byggnader 2009). A new fan or heat exchanger in the
  // same unit is a partial renovation.
  {
    type: 'ventilation_ftx',
    label: {
      sv: 'FTX-ventilation',
      en: 'Balanced ventilation with heat recovery',
    },
    category: 'ventilation',
    attributeSchema: { ...replaceable, ...partialRenovation, ...modelName },
    allowedSubcomponents: ['electric_duct_heater'],
    forecastDefaults: { earliestYear: 1975 },
  },
  // Mechanical exhaust became usual in new homes in the early 1970s, with
  // early systems before that (Flexit; SFV 2009). With heat recovery it is
  // an FX unit, an exhaust-air heat pump, from 1980 (Fehrm 1993).
  {
    type: 'ventilation_exhaust',
    label: { sv: 'Frånluftsventilation', en: 'Exhaust ventilation' },
    category: 'ventilation',
    attributeSchema: {
      heat_recovery: yesNo(
        'Värmeåtervinning (FX)',
        'Heat recovery (exhaust-air heat pump)'
      ),
      ...replaceable,
      ...modelName,
    },
    forecastDefaults: { earliestYear: 1965 },
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
    forecastDefaults: { assumeUndocumented: true },
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
          'I mark till förbindelsepunkten eller det enskilda avloppet',
          'In the ground to the connection point or the private sewage system',
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
    // Old cast-iron, concrete and clay pipes are filmed first, and most can
    // be relined instead of replaced; a collapsed or badly deformed pipe
    // cannot, which is the high scenario.
    // A house on a slab on ground also has its sewer under the slab, the
    // section that costs most to reach: assumed with section under_slab
    // unless such a section is documented (assumeVariants).
    forecastDefaults: {
      assumeUndocumented: true,
      context: { foundation_type: 'foundation' },
      assumeVariants: [
        {
          values: { section: 'under_slab' },
          whenContext: { foundation_type: ['slab_on_ground'] },
        },
      ],
      profileKeyOrder: ['renovation_method', 'material', 'section'],
      cheaperRenewal: {
        when: { material: ['cast_iron', 'concrete', 'clay'] },
        match: { renovation_method: 'relined' },
      },
      inspection: {
        costLowSek: 3000,
        costHighSek: 8000,
        priceYear: 2026,
        sources: [
          {
            name: 'Reliningbolaget, Rörinspektion, vad kostar det? (riktvärden 2026)',
            url: 'https://reliningbolaget.se/kunskap/rorinspektion-kostnad',
            costSek: null,
            costSekRange: [3000, 8000],
            note: 'Villa: one main drain up to 30 m 3 000-5 000, whole system incl. storm water 5 000-8 000; filmed to see whether relining is enough',
          },
          {
            name: 'Spolbil Direkt, Rörinspektion pris 2026',
            url: 'https://spolbildirekt.se/vad-kostar-rorinspektion/',
            costSek: null,
            costSekRange: [2800, 3200],
            note: 'From 1 323 kr/h, minimum 2 h; villa example with flushing and camera 2 800-3 200; travel may be added',
          },
        ],
      },
    },
  },

  // Water and sewage outside the municipal network. The house says which it
  // has (water_supply and sewage_system in houseKeys.ts); a private or
  // shared well or sewage system is also a component, so that the pump, the
  // treatment and the system itself can be forecast.
  {
    type: 'water_well',
    label: { sv: 'Brunn', en: 'Water well' },
    category: 'plumbing',
    // No lifespan profile, like the foundation: a well is not a wearing
    // part. What is replaced is the pump and the treatment under it. Water
    // unfit for drinking is flagged at read time (derive.ts, risks).
    attributeSchema: {
      well_type: choice('Typ', 'Type', {
        drilled: ['Borrad', 'Drilled'],
        dug: ['Grävd', 'Dug'],
      }),
      depth_m: {
        label: { sv: 'Djup', en: 'Depth' },
        datatype: 'number',
        unit: 'm',
        min: 0,
      },
      capacity_l_per_hour: {
        label: { sv: 'Kapacitet', en: 'Capacity' },
        datatype: 'number',
        unit: 'l/h',
        min: 0,
      },
      shared: yesNo('Gemensam med grannar', 'Shared with neighbours'),
      water_test_year: {
        label: { sv: 'Senaste vattenprov', en: 'Last water test' },
        datatype: 'year',
      },
      water_test_result: choice('Resultat av vattenprov', 'Water test result', {
        fit: ['Tjänligt', 'Fit for drinking'],
        fit_with_remarks: ['Tjänligt med anmärkning', 'Fit with remarks'],
        unfit: ['Otjänligt', 'Unfit for drinking'],
      }),
      radon_in_water_bq_l: {
        label: { sv: 'Radon i vattnet', en: 'Radon in water' },
        datatype: 'number',
        unit: 'Bq/l',
        min: 0,
      },
      ...replaceable,
    },
    allowedSubcomponents: ['well_pump', 'water_treatment'],
  },
  {
    type: 'well_pump',
    label: { sv: 'Brunnspump', en: 'Well pump' },
    category: 'plumbing',
    attributeSchema: {
      pump_type: choice('Typ', 'Type', {
        submersible: ['Dränkbar pump', 'Submersible'],
        surface: ['Ytpump', 'Surface pump'],
      }),
      pressure_tank: yesNo('Hydrofor eller tryckkärl', 'Pressure tank'),
      ...replaceable,
      ...modelName,
    },
  },
  {
    type: 'water_treatment',
    label: { sv: 'Vattenrening', en: 'Water treatment' },
    category: 'plumbing',
    // One component per filter or unit: they have different lifespans and
    // different checks (UV lamp, regeneration, filter mass).
    attributeSchema: {
      treatment_type: choice('Typ', 'Type', {
        softener: ['Avhärdningsfilter', 'Water softener'],
        iron_manganese: ['Järn- och manganfilter', 'Iron and manganese filter'],
        ph_adjustment: ['Alkaliseringsfilter', 'pH adjustment'],
        uv: ['UV-aggregat', 'UV unit'],
        radon_removal: ['Radonavskiljare', 'Radon removal'],
        activated_carbon: ['Kolfilter', 'Activated carbon'],
        reverse_osmosis: ['Omvänd osmos', 'Reverse osmosis'],
      }),
      ...replaceable,
      ...modelName,
    },
  },
  {
    type: 'private_sewage',
    label: { sv: 'Enskilt avlopp', en: 'Private sewage system' },
    category: 'plumbing',
    // A system the municipality has failed, or a sludge separator alone, is
    // flagged at read time (derive.ts, risks): it can be the largest single
    // cost of a house in the countryside.
    attributeSchema: {
      system_type: choice('Anläggning', 'System', {
        infiltration: ['Infiltration', 'Soil infiltration'],
        soil_filter: ['Markbädd', 'Soil filter bed'],
        package_plant: ['Minireningsverk', 'Package treatment plant'],
        closed_tank: ['Sluten tank', 'Closed tank'],
        sludge_separator_only: [
          'Endast slamavskiljare',
          'Sludge separator only',
        ],
      }),
      sludge_separator: choice('Slamavskiljare', 'Sludge separator', {
        three_chamber: ['Trekammarbrunn', 'Three-chamber'],
        two_chamber: ['Tvåkammarbrunn', 'Two-chamber'],
        single_chamber: ['Enkammarbrunn', 'Single-chamber'],
        none: ['Ingen', 'None'],
      }),
      permit_year: {
        label: { sv: 'Tillstånd från år', en: 'Permit year' },
        datatype: 'year',
      },
      municipal_assessment: choice(
        'Kommunens bedömning',
        'Municipal assessment',
        {
          approved: ['Godkänt', 'Approved'],
          needs_action: ['Åtgärd krävs', 'Action required'],
          discharge_ban: ['Utsläppsförbud', 'Discharge ban'],
        }
      ),
      shared: yesNo('Gemensamt med grannar', 'Shared with neighbours'),
      ...replaceable,
      ...inspectedYear,
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
    forecastDefaults: {
      assumeUndocumented: true,
      quantityPerLivingM2: 1.0,
    },
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
    forecastDefaults: { assumeUndocumented: true },
  },
  {
    type: 'solar_panels',
    label: { sv: 'Solceller', en: 'Solar panels' },
    category: 'electrical',
    // Panels on the roof must be lifted off when the roof covering is
    // replaced; the inverter is replaced more than once in their lifetime,
    // so it is a component of its own. A battery without panels is a
    // top-level component.
    attributeSchema: {
      peak_power_kw: {
        label: { sv: 'Toppeffekt', en: 'Peak power' },
        description: { sv: 'Toppeffekt i kWp', en: 'Peak power in kWp' },
        datatype: 'number',
        unit: 'kW',
        min: 0,
      },
      mounting: choice('Montering', 'Mounting', {
        roof: ['På taket', 'On the roof'],
        integrated: ['Integrerade i taket', 'Integrated in the roof'],
        ground: ['På mark', 'On the ground'],
      }),
      production_kwh_per_year: {
        label: { sv: 'Produktion per år', en: 'Production per year' },
        datatype: 'number',
        unit: 'kWh',
        min: 0,
      },
      ...replaceable,
      area: {
        label: { sv: 'Yta', en: 'Area' },
        description: {
          sv: 'Panelernas yta; ungefär 5,5 m2 per kWp om bara effekten är känd',
          en: 'Panel area; about 5.5 m2 per kWp when only the peak power is known',
        },
        datatype: 'number',
        unit: 'm2',
        min: 0,
      },
      ...modelName,
      ...orientation,
    },
    allowedSubcomponents: ['solar_inverter', 'battery_storage'],
    // Grid-connected panels on private houses came with the investment
    // support of July 2009; Sweden had about 8 MW in all before that
    // (Elforsk 10:46, https://energiforsk.se/media/21068/10-46-konsekvensanalys-av-investeringsstod-till-solceller.pdf).
    forecastDefaults: { earliestYear: 2009 },
  },
  {
    type: 'solar_inverter',
    label: { sv: 'Växelriktare', en: 'Inverter' },
    category: 'electrical',
    attributeSchema: { ...replaceable, ...modelName, ...capacityKw },
    forecastDefaults: { earliestYear: 2009 },
  },
  // The first grant for home batteries covers installations started from
  // 1 January 2016 (SFS 2016:899, https://data.riksdagen.se/dokument/sfs-2016-899.text).
  {
    type: 'battery_storage',
    label: { sv: 'Batterilager', en: 'Battery storage' },
    category: 'electrical',
    attributeSchema: {
      capacity_kwh: {
        label: { sv: 'Kapacitet', en: 'Capacity' },
        datatype: 'number',
        unit: 'kWh',
        min: 0,
      },
      ...replaceable,
      ...modelName,
    },
    forecastDefaults: { earliestYear: 2016 },
  },
  // The first mass-produced electric cars reached Swedish dealers in 2010
  // (Vi Bilägare 2009-12-22, https://www.vibilagare.se/nyheter/2010-aret-vi-far-riktig-elkontakt-1784);
  // 157 chargeable cars were on the road in 2009 (SVT, citing Trafikanalys).
  {
    type: 'ev_charger',
    label: { sv: 'Laddbox', en: 'EV charger' },
    category: 'electrical',
    // Without load balancing a charger may need a larger main fuse
    // (electrical_panel, main_fuse_a).
    forecastDefaults: { earliestYear: 2010 },
    attributeSchema: {
      power_kw: {
        label: { sv: 'Laddeffekt', en: 'Charging power' },
        datatype: 'number',
        unit: 'kW',
        min: 0,
      },
      phases: choice('Faser', 'Phases', {
        single_phase: ['Enfas', 'Single-phase'],
        three_phase: ['Trefas', 'Three-phase'],
      }),
      load_balancing: yesNo('Lastbalansering', 'Load balancing'),
      ...quantity,
      ...replaceable,
      ...modelName,
    },
  },

  // Interior ------------------------------------------------------------------
  {
    type: 'kitchen',
    label: { sv: 'Kök', en: 'Kitchen' },
    category: 'interior',
    attributeSchema: { ...replaceable, ...partialRenovation, ...modelName },
    forecastDefaults: { assumeUndocumented: true },
  },
  {
    type: 'bathroom',
    label: { sv: 'Badrum', en: 'Bathroom' },
    category: 'interior',
    // Bathrooms are counted, not stored: "2 badrum" becomes two components.
    // A room with a shower or a bath and a toilet; a toilet without one is a
    // wc and a shower without a toilet a shower_room, so that neither gets
    // the bathroom's lifespan and renovation cost (type_library
    // conventions).
    attributeSchema: {
      ...replaceable,
      ...partialRenovation,
      ...area,
      wet_room_certified: yesNo('Våtrumsintyg', 'Wet room certificate'),
    },
    allowedSubcomponents: ['underfloor_heating'],
    // With two, the second in need is less urgent while the first works.
    forecastDefaults: { assumeUndocumented: true, oneOfSeveral: true },
  },
  // A shower room without a toilet, such as the one beside a sauna or in a
  // basement: a small wet room with a membrane and a drain, at half to two
  // thirds of a bathroom's cost.
  {
    type: 'shower_room',
    label: { sv: 'Duschrum', en: 'Shower room' },
    category: 'interior',
    attributeSchema: {
      ...replaceable,
      ...partialRenovation,
      ...area,
      wet_room_certified: yesNo('Våtrumsintyg', 'Wet room certificate'),
    },
    allowedSubcomponents: ['underfloor_heating'],
  },
  // A toilet room without a shower or bath (a WC with a shower is a
  // bathroom): new fixtures and surfaces, often without a wet-room membrane,
  // at a fraction of a bathroom's cost.
  {
    type: 'wc',
    label: { sv: 'Toalett (WC)', en: 'Toilet room' },
    category: 'interior',
    attributeSchema: {
      ...replaceable,
      ...partialRenovation,
      ...area,
      floor_drain: yesNo('Golvbrunn', 'Floor drain'),
    },
    allowedSubcomponents: ['underfloor_heating'],
  },
  // A smaller wet room: laundry room or utility room with a floor drain.
  {
    type: 'laundry_room',
    label: { sv: 'Tvättstuga', en: 'Laundry room' },
    category: 'interior',
    attributeSchema: {
      ...replaceable,
      ...partialRenovation,
      ...area,
      floor_drain: yesNo('Golvbrunn', 'Floor drain'),
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

  // Features. Sauna, deck and balcony have lifespan profiles; the pool and
  // the sunroom none yet. Garage and carport are priced through their
  // parts: no source gives a lifespan for the building itself. ------------------
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
    // A deck without an area is taken as the guides' standard example of
    // 25 m2 (BraByggare 2026; Hantverkskollen's 30 and Offerta's 20).
    forecastDefaults: { assumedQuantity: 25 },
  },
  // A balcony on an upper floor, as the deck is on the ground: a glazed one
  // is a common search criterion. Priced per balcony.
  {
    type: 'balcony',
    label: { sv: 'Balkong', en: 'Balcony' },
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
      ...area,
      ...installationYear,
      ...condition,
    },
    // Priced through its parts: a detached garage's roof and facade are
    // components under it, each with its own area. A building of its own,
    // so its parts neither take from nor count toward the house's estimated
    // roof and wall area (forecastDefaults.separateBuilding).
    allowedSubcomponents: [
      'garage_door',
      'roof_covering',
      'facade',
      'window',
      'exterior_door',
    ],
    forecastDefaults: { separateBuilding: true },
  },

  // The plot, apart from the buildings -----------------------------------------
  {
    type: 'driveway',
    label: { sv: 'Uppfart och markbeläggning', en: 'Driveway and paving' },
    category: 'site',
    attributeSchema: {
      surface: choice('Beläggning', 'Surface', {
        asphalt: ['Asfalt', 'Asphalt'],
        paving_stones: ['Marksten', 'Paving stones'],
        concrete_slabs: ['Betongplattor', 'Concrete slabs'],
        natural_stone: ['Natursten', 'Natural stone'],
        gravel: ['Grus', 'Gravel'],
      }),
      ground_heating: yesNo('Markvärme', 'Ground heating'),
      ...replaceable,
      ...area,
    },
    // Without a surface the type's default profile spans asphalt to stone;
    // without an area a usual villa driveway of 60 m2 (the guides' examples
    // run 50 to 120 m2).
    forecastDefaults: { assumedQuantity: 60 },
  },
  {
    type: 'fence',
    label: { sv: 'Staket och plank', en: 'Fence' },
    category: 'site',
    // A long wooden fence is a recurring painting cost the listing seldom
    // mentions: the wood profile repaints from last_painted_year like a
    // facade.
    attributeSchema: {
      material: choice('Material', 'Material', {
        wood: ['Trä', 'Wood'],
        metal: ['Metall', 'Metal'],
        mesh: ['Nät', 'Wire mesh'],
        composite: ['Komposit', 'Composite'],
      }),
      height: {
        label: { sv: 'Höjd', en: 'Height' },
        datatype: 'number',
        unit: 'm',
        min: 0,
      },
      ...replaceable,
      ...length,
      ...paint,
    },
  },
  {
    type: 'retaining_wall',
    label: { sv: 'Stödmur', en: 'Retaining wall' },
    category: 'site',
    attributeSchema: {
      material: choice('Material', 'Material', {
        concrete: ['Gjuten betong', 'Cast concrete'],
        concrete_blocks: [
          'Betongblock eller L-stöd',
          'Concrete blocks or L-elements',
        ],
        natural_stone: ['Natursten', 'Natural stone'],
        wood: ['Trä eller sliprar', 'Wood or sleepers'],
      }),
      height: {
        label: { sv: 'Höjd', en: 'Height' },
        datatype: 'number',
        unit: 'm',
        min: 0,
      },
      ...replaceable,
      ...length,
    },
  },
  // Sheds, woodsheds, guest houses and the like (komplementbyggnader). A
  // simple timber shed is rebuilt when worn out and has a lifespan profile
  // per building_kind; a guest house or workshop is priced through its own
  // roof, facade, windows and doors as subcomponents and has no lifespan of
  // its own. A building of its own (separateBuilding), like the garage.
  // Repainting is not modelled yet.
  {
    type: 'outbuilding',
    label: { sv: 'Komplementbyggnad', en: 'Outbuilding' },
    category: 'feature',
    attributeSchema: {
      building_kind: choice('Sort', 'Kind', {
        storage_shed: ['Förråd', 'Storage shed'],
        woodshed: ['Vedbod', 'Woodshed'],
        friggebod: ['Friggebod', 'Friggebod'],
        barn: ['Uthus eller ladugård', 'Barn or outhouse'],
        guest_house: ['Gäststuga', 'Guest house'],
        attefall_house: ['Attefallshus', 'Attefall house'],
        workshop: ['Verkstad', 'Workshop'],
        greenhouse: ['Växthus', 'Greenhouse'],
        playhouse: ['Lekstuga', 'Playhouse'],
        gazebo: ['Lusthus', 'Gazebo'],
      }),
      insulated: yesNo('Isolerad', 'Insulated'),
      electricity: yesNo('Indragen el', 'Electricity'),
      water: yesNo('Indraget vatten', 'Water'),
      ...area,
      ...installationYear,
      ...condition,
    },
    allowedSubcomponents: [
      'roof_covering',
      'facade',
      'window',
      'exterior_door',
      'foundation',
    ],
    // A shed without an area is taken as 12 m2 (the guides' kits run 10 to
    // 15 m2, and a friggebod is at most 15).
    forecastDefaults: { separateBuilding: true, assumedQuantity: 12 },
  },
  // No lifespan of its own, since no source gives one for the structure: the
  // roof through roof_covering, the paint through last_painted_year.
  {
    type: 'carport',
    label: { sv: 'Carport', en: 'Carport' },
    category: 'feature',
    attributeSchema: {
      capacity: {
        label: { sv: 'Bilplatser', en: 'Parking spaces' },
        datatype: 'number',
        min: 1,
      },
      attached: yesNo('Sammanbyggd med huset', 'Attached to the house'),
      storage: yesNo('Med förråd', 'With storage'),
      material: choice('Material', 'Material', {
        wood: ['Trä', 'Wood'],
        steel: ['Stål', 'Steel'],
        aluminium: ['Aluminium', 'Aluminium'],
      }),
      ...installationYear,
      ...condition,
      last_painted_year: paint.last_painted_year,
    },
    // A carport with storage has walls, a window and a door as well as the
    // roof, its gutters and the space under the roof.
    allowedSubcomponents: [
      'roof_covering',
      'roof_drainage',
      'facade',
      'window',
      'exterior_door',
      'attic',
    ],
    forecastDefaults: { separateBuilding: true },
  },
]
