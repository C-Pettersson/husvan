// A made-up house for the public /demo page: every kind of row Husvan stores
// about a house, with plausible values. The address, the property
// designation, the firms and the documents are invented. demoHouse.test.ts
// checks the values against the type library, so the page cannot show
// something the server would refuse to store.
import type { ValueSource } from '@prisma/client'
import type {
  ComponentView,
  KeyValueView,
  ValueRow,
} from '@/server/houses/getHouse'
import { currentValues } from '@/server/houses/currentValue'

type Observation = {
  key: string
  value: string | number | boolean
  unit?: string
  source: ValueSource
  confidence?: number
  quote?: string
  doc?: DocumentId
  at: string
  draft?: boolean
}

export const DEMO_CORE = {
  address: 'Exempelvägen 7, 961 99 Boden',
  propertyDesignation: 'Exempeln 3:14', // fastighetsbeteckning
  municipality: { code: '2582', name: 'Boden' },
  status: 'CANDIDATE' as const,
  createdAt: '2026-09-14',
}

export const DEMO_ACTORS = {
  broker: { name: 'Exempelmäklarna i Boden AB', roles: ['broker'] },
  inspector: { name: 'Besiktningsbyrån Exempel AB', roles: ['inspector'] },
  energy: { name: 'Energikonsult Exempel AB', roles: ['inspector'] },
  pipes: { name: 'Rörfilm Exempel AB', roles: ['inspector'] },
  installer: {
    name: 'Värmeteknik Exempel AB',
    orgNumber: '556000-0000', // organisationsnummer
    roles: ['installer', 'supplier'],
  },
} as const
export type ActorId = keyof typeof DEMO_ACTORS

export type DemoDocument = {
  id: string
  type:
    | 'LISTING'
    | 'ENERGY_CERTIFICATE'
    | 'INSPECTION'
    | 'PIPE_INSPECTION'
    | 'INVOICE'
  title: string
  date: string
  actor: ActorId
  filename: string
  sizeBytes: number
  pages: number
  amountSek?: number
  sourceUrl?: string
}

export const DEMO_DOCUMENTS = [
  {
    id: 'listing',
    type: 'LISTING',
    title: 'Prospekt Exempelvägen 7',
    date: '2026-09-12',
    actor: 'broker',
    filename: 'prospekt-exempelvagen-7.pdf',
    sizeBytes: 4_812_000,
    pages: 16,
    sourceUrl: 'https://example.com/objekt/exempelvagen-7',
  },
  {
    id: 'energy',
    type: 'ENERGY_CERTIFICATE',
    title: 'Energideklaration',
    date: '2019-05-20',
    actor: 'energy',
    filename: 'energideklaration-2019.pdf',
    sizeBytes: 612_000,
    pages: 6,
  },
  {
    id: 'inspection',
    type: 'INSPECTION',
    title: 'Överlåtelsebesiktning',
    date: '2026-10-02',
    actor: 'inspector',
    filename: 'besiktningsprotokoll.pdf',
    sizeBytes: 2_240_000,
    pages: 24,
  },
  {
    id: 'invoice',
    type: 'INVOICE',
    title: 'Faktura luft/vattenvärmepump',
    date: '2019-11-12',
    actor: 'installer',
    filename: 'faktura-varmepump.pdf',
    sizeBytes: 148_000,
    pages: 1,
    amountSek: 128_400,
  },
  {
    id: 'pipes',
    type: 'PIPE_INSPECTION',
    title: 'Filmning av spillvattenledningar',
    date: '2026-10-20',
    actor: 'pipes',
    filename: 'rorinspektion.pdf',
    sizeBytes: 3_960_000,
    pages: 11,
  },
] as const satisfies readonly DemoDocument[]
type DocumentId = (typeof DEMO_DOCUMENTS)[number]['id']

const L = 'listing' as const
const E = 'energy' as const
const I = 'inspection' as const

// The house itself (componentId null).
const HOUSE: Observation[] = [
  {
    key: 'sale_status',
    value: 'bidding',
    source: 'CLAUDE',
    confidence: 0.9,
    quote: 'Budgivning pågår',
    doc: L,
    at: '2026-09-14',
  },
  {
    key: 'asking_price_sek',
    value: 3_150_000,
    unit: 'SEK',
    source: 'CLAUDE',
    confidence: 0.95,
    quote: 'Utgångspris 3 150 000 kr',
    doc: L,
    at: '2026-09-14',
  },
  // A watch saw the price lowered; for prices the latest observation wins.
  {
    key: 'asking_price_sek',
    value: 2_950_000,
    unit: 'SEK',
    source: 'IMPORT',
    at: '2026-10-28',
  },
  {
    key: 'highest_bid_sek',
    value: 3_025_000,
    unit: 'SEK',
    source: 'USER',
    at: '2026-11-02',
  },
  {
    key: 'highest_bid_date',
    value: '2026-11-02',
    source: 'USER',
    at: '2026-11-02',
  },
  {
    key: 'house_type',
    value: 'detached',
    source: 'CLAUDE',
    confidence: 0.95,
    quote: 'Friliggande villa i ett och ett halvt plan med källare',
    doc: L,
    at: '2026-09-14',
  },
  {
    key: 'tenure',
    value: 'freehold',
    source: 'CLAUDE',
    confidence: 0.95,
    quote: 'Upplåtelseform: Äganderätt',
    doc: L,
    at: '2026-09-14',
  },
  {
    key: 'construction_year',
    value: 1976,
    source: 'CLAUDE',
    confidence: 0.9,
    quote: 'Byggår 1976',
    doc: L,
    at: '2026-09-14',
  },
  {
    key: 'construction_year',
    value: 1977,
    source: 'CLAUDE',
    confidence: 0.75,
    quote: 'Huset uppfördes enligt uppgift 1977',
    doc: I,
    at: '2026-10-03',
  },
  {
    key: 'living_area',
    value: 128,
    unit: 'm2',
    source: 'CLAUDE',
    confidence: 0.95,
    quote: 'Boarea 128 kvm',
    doc: L,
    at: '2026-09-14',
  },
  {
    key: 'secondary_area',
    value: 64,
    unit: 'm2',
    source: 'CLAUDE',
    confidence: 0.9,
    quote: 'Biarea 64 kvm (källare)',
    doc: L,
    at: '2026-09-14',
  },
  {
    key: 'plot_area',
    value: 1_120,
    unit: 'm2',
    source: 'CLAUDE',
    confidence: 0.95,
    quote: 'Tomtarea 1 120 kvm',
    doc: L,
    at: '2026-09-14',
  },
  {
    key: 'room_count',
    value: 5,
    source: 'CLAUDE',
    confidence: 0.95,
    quote: '5 rum och kök',
    doc: L,
    at: '2026-09-14',
  },
  {
    key: 'bedroom_count',
    value: 3,
    source: 'CLAUDE',
    confidence: 0.9,
    quote: 'tre sovrum på övervåningen',
    doc: L,
    at: '2026-09-14',
  },
  {
    key: 'floor_count',
    value: 2,
    source: 'CLAUDE',
    confidence: 0.8,
    quote: 'Entréplan och övervåning',
    doc: L,
    at: '2026-09-14',
  },
  {
    key: 'assessed_value_sek',
    value: 1_874_000,
    unit: 'SEK',
    source: 'IMPORT',
    at: '2026-09-15',
  },
  { key: 'assessment_year', value: 2024, source: 'IMPORT', at: '2026-09-15' },
  {
    key: 'property_fee_sek_per_year',
    value: 9_525,
    unit: 'SEK',
    source: 'CLAUDE',
    confidence: 0.85,
    quote: 'Fastighetsavgift 9 525 kr/år',
    doc: L,
    at: '2026-09-14',
  },
  {
    key: 'energy_class',
    value: 'E',
    source: 'CLAUDE',
    confidence: 0.95,
    quote: 'Energiklass E',
    doc: E,
    at: '2026-09-20',
  },
  {
    key: 'energy_performance_kwh_per_m2',
    value: 142,
    unit: 'kWh/m2',
    source: 'CLAUDE',
    confidence: 0.95,
    quote: 'Energiprestanda 142 kWh/m² och år',
    doc: E,
    at: '2026-09-20',
  },
  {
    key: 'energy_declaration_year',
    value: 2019,
    source: 'CLAUDE',
    confidence: 0.95,
    quote: 'Upprättad 2019-05-20',
    doc: E,
    at: '2026-09-20',
  },
  {
    key: 'heating_kwh_per_year',
    value: 9_400,
    unit: 'kWh',
    source: 'CLAUDE',
    confidence: 0.8,
    quote: 'Uppvärmning 9 400 kWh/år',
    doc: E,
    at: '2026-09-20',
  },
  {
    key: 'electricity_kwh_per_year',
    value: 6_200,
    unit: 'kWh',
    source: 'CLAUDE',
    confidence: 0.7,
    quote: 'Hushållsel ca 6 200 kWh/år',
    doc: L,
    at: '2026-09-14',
  },
  {
    key: 'water_sewage_cost_sek_per_year',
    value: 8_900,
    unit: 'SEK',
    source: 'CLAUDE',
    confidence: 0.85,
    quote: 'Vatten och avlopp 8 900 kr/år',
    doc: L,
    at: '2026-09-14',
  },
  {
    key: 'waste_cost_sek_per_year',
    value: 3_400,
    unit: 'SEK',
    source: 'CLAUDE',
    confidence: 0.85,
    quote: 'Sophämtning 3 400 kr/år',
    doc: L,
    at: '2026-09-14',
  },
  {
    key: 'chimney_sweeping_cost_sek_per_year',
    value: 650,
    unit: 'SEK',
    source: 'CLAUDE',
    confidence: 0.8,
    quote: 'Sotning 650 kr/år',
    doc: L,
    at: '2026-09-14',
  },
  // The user's own quote, typed on the web page.
  {
    key: 'insurance_cost_sek_per_year',
    value: 6_800,
    unit: 'SEK',
    source: 'USER',
    at: '2026-10-08',
  },
  {
    key: 'water_supply',
    value: 'municipal',
    source: 'CLAUDE',
    confidence: 0.95,
    quote: 'Kommunalt vatten och avlopp',
    doc: L,
    at: '2026-09-14',
  },
  {
    key: 'sewage_system',
    value: 'municipal',
    source: 'CLAUDE',
    confidence: 0.95,
    quote: 'Kommunalt vatten och avlopp',
    doc: L,
    at: '2026-09-14',
  },
  {
    key: 'radon_measured',
    value: true,
    source: 'CLAUDE',
    confidence: 0.9,
    quote: 'Radonmätning utförd 2018',
    doc: L,
    at: '2026-09-14',
  },
  {
    key: 'radon_measurement_year',
    value: 2018,
    source: 'CLAUDE',
    confidence: 0.9,
    quote: 'Radonmätning utförd 2018',
    doc: L,
    at: '2026-09-14',
  },
  {
    key: 'radon_bq_m3',
    value: 110,
    unit: 'Bq/m3',
    source: 'CLAUDE',
    confidence: 0.9,
    quote: 'årsmedelvärde 110 Bq/m³',
    doc: L,
    at: '2026-09-14',
  },
]

type Part = {
  id: string
  type: string
  name?: string
  draft?: boolean
  // This part replaced that one (CLAUDE.md, "Bara tillägg").
  replaces?: string
  values: Observation[]
  children?: Part[]
}

const y = (
  key: string,
  value: string | number | boolean,
  doc: DocumentId,
  quote: string,
  confidence = 0.85,
  at = doc === 'inspection' ? '2026-10-03' : '2026-09-14',
  unit?: string
): Observation => ({
  key,
  value,
  doc,
  quote,
  confidence,
  at,
  unit,
  source: 'CLAUDE',
})

const PARTS: Part[] = [
  {
    id: 'foundation',
    type: 'foundation',
    values: [
      y('foundation_type', 'basement', L, 'Källare under hela huset', 0.95),
      y(
        'basement_wall_insulation',
        'interior',
        I,
        'Källarytterväggar invändigt isolerade',
        0.8
      ),
      y('condition', 3, I, 'Inga synliga sättningar'),
    ],
    children: [
      {
        id: 'drainage',
        type: 'drainage',
        values: [
          y(
            'installation_year',
            1976,
            I,
            'Dränering ursprunglig från byggåret',
            0.75
          ),
          y('condition', 2, I, 'Förhöjd fuktkvot i källarens nordvägg', 0.7),
          y('length', 52, I, 'ca 52 m runt huset', 0.6, undefined, 'm'),
        ],
      },
    ],
  },
  {
    id: 'roof',
    type: 'roof_covering',
    values: [
      y('material', 'concrete_tile', L, 'Tak av betongpannor', 0.95),
      y('installation_year', 1976, L, 'Ursprungligt tak', 0.8),
      y('condition', 3, I, 'Påväxt av mossa, enstaka spruckna pannor'),
      y('area', 165, I, 'Takyta ca 165 m²', 0.6, undefined, 'm2'),
    ],
  },
  {
    id: 'facade',
    type: 'facade',
    values: [
      y('material', 'wood_panel', L, 'Träpanel', 0.95),
      y('installation_year', 1976, L, 'Ursprunglig fasad', 0.8),
      y('last_painted_year', 2014, L, 'Fasaden målad 2014', 0.85),
      y('paint_type', 'alkyd_oil', I, 'Alkydoljefärg', 0.7),
      y('condition', 3, I, 'Flagning på söder- och västsidan'),
    ],
  },
  {
    id: 'windows',
    type: 'window',
    name: 'Alla fönster',
    values: [
      y('frame_material', 'wood', L, 'Träfönster', 0.9),
      y('glazing', 'triple', L, '3-glas', 0.9),
      y('quantity', 14, I, '14 fönster', 0.85),
      y('installation_year', 1998, L, 'Fönster bytta 1998', 0.85),
      y('condition', 3, I, 'Kittfalsar i behov av underhåll'),
    ],
  },
  {
    id: 'boiler',
    type: 'electric_boiler',
    values: [
      y('installation_year', 1976, I, 'Ursprunglig elpanna, ersatt', 0.7),
    ],
  },
  {
    id: 'heat_pump',
    type: 'heat_pump_air_water',
    replaces: 'boiler',
    values: [
      // The listing said 2018; the user retracted that value (see the log).
      y(
        'installation_year',
        2019,
        'invoice',
        'Installation utförd 2019-11-08',
        0.95,
        '2026-10-10'
      ),
      y(
        'capacity_kw',
        9,
        'invoice',
        'Luft/vattenvärmepump 9 kW',
        0.95,
        '2026-10-10',
        'kW'
      ),
      y(
        'model_name',
        'AW 9 Exempel',
        'invoice',
        'Modell AW 9',
        0.9,
        '2026-10-10'
      ),
      y('condition', 4, I, 'Fungerar, servad 2025'),
    ],
    children: [],
  },
  {
    id: 'radiators',
    type: 'hydronic_radiators',
    values: [
      y('pipe_system', 'two_pipe', I, 'Tvårörssystem', 0.8),
      y('quantity', 11, I, '11 radiatorer', 0.8),
      y('installation_year', 1976, I, 'Ursprungliga radiatorer', 0.75),
    ],
  },
  {
    id: 'water_heater',
    type: 'water_heater',
    values: [
      y(
        'volume_l',
        300,
        'invoice',
        'Varmvattenberedare 300 l',
        0.95,
        '2026-10-10',
        'l'
      ),
      y(
        'installation_year',
        2019,
        'invoice',
        'monterad tillsammans med värmepumpen',
        0.9,
        '2026-10-10'
      ),
    ],
  },
  {
    id: 'chimney',
    type: 'chimney',
    values: [
      y('material', 'brick', I, 'Murad skorsten', 0.9),
      y(
        'inspected_year',
        2025,
        L,
        'Brandskyddskontroll 2025 utan anmärkning',
        0.85
      ),
    ],
  },
  {
    id: 'stove',
    type: 'wood_stove',
    values: [
      y('material', 'soapstone', L, 'Täljstenskamin i vardagsrummet', 0.9),
      y('installation_year', 2008, L, 'installerad 2008', 0.85),
    ],
  },
  {
    id: 'ventilation',
    type: 'ventilation_exhaust',
    values: [
      y('heat_recovery', false, I, 'Mekanisk frånluft utan återvinning', 0.85),
      y('installation_year', 2011, I, 'Frånluftsfläkt bytt 2011', 0.7),
    ],
  },
  {
    id: 'water_pipes',
    type: 'water_pipes',
    values: [
      y('material', 'copper', I, 'Tappvattenledningar av koppar', 0.85),
      y('installation_year', 1976, I, 'Ursprungliga', 0.75),
    ],
  },
  {
    id: 'sewer',
    type: 'sewer_pipes',
    name: 'Källare och bottenplatta',
    values: [
      y('material', 'cast_iron', I, 'Avloppsledningar av gjutjärn', 0.85),
      y('section', 'indoor', I, 'synliga ledningar i källaren', 0.8),
      y('installation_year', 1976, I, 'Ursprungliga', 0.75),
      // From the open draft: Claude's reading of the pipe inspection.
      {
        ...y(
          'condition',
          2,
          'pipes',
          'Korrosion och sprickbildning i gjutjärnsledningar',
          0.85,
          '2026-10-21'
        ),
        draft: true,
      },
      {
        ...y(
          'inspected_year',
          2026,
          'pipes',
          'Filmning utförd 2026-10-20',
          0.95,
          '2026-10-21'
        ),
        draft: true,
      },
    ],
  },
  {
    id: 'panel',
    type: 'electrical_panel',
    values: [
      y('panel_type', 'circuit_breakers', I, 'Automatsäkringar', 0.9),
      y('rcd', true, I, 'Jordfelsbrytare finns', 0.9),
      y('main_fuse_a', 20, L, 'Huvudsäkring 20 A', 0.9, undefined, 'A'),
      y('installation_year', 2012, I, 'Elcentral bytt 2012', 0.8),
    ],
  },
  {
    id: 'kitchen',
    type: 'kitchen',
    values: [
      y('installation_year', 2009, L, 'Kök från 2009', 0.85),
      y(
        'partial_renovation_year',
        2021,
        L,
        'nya luckor och bänkskivor 2021',
        0.8
      ),
      y('condition', 4, I, 'Gott skick'),
    ],
  },
  {
    id: 'bathroom',
    type: 'bathroom',
    name: 'Badrum övervåningen',
    values: [
      y('installation_year', 2004, L, 'Badrum renoverat 2004', 0.85),
      y('area', 6, L, 'ca 6 kvm', 0.7, undefined, 'm2'),
      y(
        'wet_room_certified',
        false,
        I,
        'Intyg om behörig våtrumsentreprenör saknas',
        0.8
      ),
      y('condition', 2, I, 'Tätskikt i slutet av sin livslängd'),
    ],
    children: [
      {
        id: 'floor_heating',
        type: 'underfloor_heating',
        values: [
          y('medium', 'electric', L, 'elektrisk golvvärme', 0.9),
          y('installation_year', 2004, L, 'Badrum renoverat 2004', 0.75),
          y('area', 5, I, 'golvvärme i hela badrummet', 0.6, undefined, 'm2'),
        ],
      },
    ],
  },
  {
    id: 'deck',
    type: 'deck',
    values: [
      y('glazing', 'open', L, 'Altan i söderläge', 0.9),
      y('orientation', 'south_west', L, 'Altan i sydvästläge', 0.8),
      y('area', 24, L, 'Altan ca 24 kvm', 0.8, undefined, 'm2'),
      y('installation_year', 2015, L, 'byggd 2015', 0.8),
    ],
  },
]

function toRows(observations: Observation[], prefix: string): ValueRow[] {
  return observations.map((o, i) => ({
    id: `${prefix}-${i}`,
    key: o.key,
    value: o.value,
    unit: o.unit ?? null,
    source: o.source,
    confidence: o.confidence ?? null,
    quote: o.quote ?? null,
    documentId: o.doc ?? null,
    recordedAt: new Date(`${o.at}T12:00:00Z`),
    draft: o.draft ?? false,
  }))
}

// The current value and its alternatives by the same rule as the real house
// page (currentValue.ts).
function view(observations: Observation[], prefix: string): KeyValueView[] {
  return [...currentValues(toRows(observations, prefix))].map(([key, kv]) => ({
    key,
    ...kv,
  }))
}

export type DemoComponent = ComponentView & {
  replaces?: { id: string; type: string }
  children: DemoComponent[]
}

function component(part: Part): DemoComponent {
  const replaced = part.replaces
    ? PARTS.find((p) => p.id === part.replaces)
    : undefined
  return {
    id: part.id,
    type: part.type,
    name: part.name ?? null,
    draft: part.draft ?? false,
    values: view(part.values, part.id),
    children: (part.children ?? []).map(component),
    replaces: replaced ? { id: replaced.id, type: replaced.type } : undefined,
  }
}

export const DEMO_VALUES = view(HOUSE, 'house')

// Parts that a later part replaced are shown under their successor, not in
// the tree (a replacement is derived, not stored on the old row).
const replacedIds = new Set(PARTS.flatMap((p) => p.replaces ?? []))
export const DEMO_REPLACED = PARTS.filter((p) => replacedIds.has(p.id)).map(
  component
)
export const DEMO_COMPONENTS = PARTS.filter((p) => !replacedIds.has(p.id)).map(
  component
)

// Every observation, for the test.
export const DEMO_OBSERVATIONS = {
  house: HOUSE,
  parts: (function flatten(parts: Part[]): Part[] {
    return parts.flatMap((p) => [p, ...flatten(p.children ?? [])])
  })(PARTS),
}

export type DemoWorkItem = {
  id: string
  component: string
  kind: 'REPLACEMENT' | 'REPAIR' | 'INVESTIGATION'
  severity?: 'MINOR' | 'RISK' | 'DEFECT' | 'SEVERE'
  description: string
  yearMin: number
  yearMax: number
  costLowSek: number
  costHighSek: number
  source: ValueSource
  confidence?: number
  doc?: DocumentId
  quote?: string
  draft?: boolean
}

export const DEMO_WORK_ITEMS: DemoWorkItem[] = [
  {
    id: 'w-drainage',
    component: 'drainage',
    kind: 'REPLACEMENT',
    severity: 'RISK',
    description: 'Byt dränering och fuktskydd runt källarens ytterväggar.',
    yearMin: 2027,
    yearMax: 2029,
    costLowSek: 180_000,
    costHighSek: 260_000,
    source: 'CLAUDE',
    confidence: 0.8,
    doc: 'inspection',
    quote: 'Risk för fuktskador. Åtgärd rekommenderas inom 1–3 år.',
  },
  {
    id: 'w-bathroom',
    component: 'bathroom',
    kind: 'INVESTIGATION',
    severity: 'RISK',
    description: 'Fuktmät badrummet på övervåningen; tätskiktet är från 2004.',
    yearMin: 2027,
    yearMax: 2027,
    costLowSek: 3_000,
    costHighSek: 6_000,
    source: 'CLAUDE',
    confidence: 0.85,
    doc: 'inspection',
    quote: 'Fortsatt teknisk utredning rekommenderas.',
  },
  {
    id: 'w-chimney',
    component: 'chimney',
    kind: 'REPAIR',
    severity: 'MINOR',
    description: 'Fäst om plåtbeslaget runt skorstenen.',
    yearMin: 2027,
    yearMax: 2027,
    costLowSek: 4_000,
    costHighSek: 8_000,
    source: 'CLAUDE',
    confidence: 0.9,
    doc: 'inspection',
    quote: 'Plåtbeslag vid skorstensgenomföring har släppt.',
  },
  {
    id: 'w-facade',
    component: 'facade',
    kind: 'REPAIR',
    description: 'Måla om fasaden, söder- och västsidan först.',
    yearMin: 2028,
    yearMax: 2029,
    costLowSek: 70_000,
    costHighSek: 110_000,
    source: 'USER',
  },
  {
    id: 'w-sewer',
    component: 'sewer',
    kind: 'REPLACEMENT',
    severity: 'DEFECT',
    description: 'Relina eller byt spillvattenledningarna i källaren.',
    yearMin: 2027,
    yearMax: 2030,
    costLowSek: 150_000,
    costHighSek: 220_000,
    source: 'CLAUDE',
    confidence: 0.85,
    doc: 'pipes',
    quote: 'Åtgärd inom 1–4 år bedöms nödvändig.',
    draft: true,
  },
]

// The forecast settings: per house, for all the owner's houses, or the
// default (run.ts, resolveAssumptions).
export const DEMO_ASSUMPTIONS = [
  { key: 'horizon_years', value: 20, scope: 'house' },
  { key: 'start_year', value: 2026, scope: 'default' },
  { key: 'interest_rate', value: 0.035, scope: 'all_houses' },
  { key: 'loan_sek', value: 2_400_000, scope: 'house' },
  { key: 'operating_cost_trend', value: 'municipality', scope: 'all_houses' },
] as const

export type DemoChangeset = {
  id: string
  at: string
  source: ValueSource
  status: 'APPROVED' | 'REJECTED' | 'DRAFT'
  // A key in demo.log.entries.
  entry: string
}

// Every write lands in a changeset (CLAUDE.md, "Skrivflöde"); the log reads
// as the history of the house.
export const DEMO_LOG: DemoChangeset[] = [
  {
    id: 'c1',
    at: '2026-09-14',
    source: 'CLAUDE',
    status: 'APPROVED',
    entry: 'created',
  },
  {
    id: 'c2',
    at: '2026-09-14',
    source: 'CLAUDE',
    status: 'APPROVED',
    entry: 'listing',
  },
  {
    id: 'c3',
    at: '2026-09-15',
    source: 'IMPORT',
    status: 'APPROVED',
    entry: 'assessment',
  },
  {
    id: 'c4',
    at: '2026-09-20',
    source: 'CLAUDE',
    status: 'APPROVED',
    entry: 'energy',
  },
  {
    id: 'c5',
    at: '2026-10-03',
    source: 'CLAUDE',
    status: 'APPROVED',
    entry: 'inspection',
  },
  {
    id: 'c6',
    at: '2026-10-03',
    source: 'CLAUDE',
    status: 'REJECTED',
    entry: 'rejected',
  },
  {
    id: 'c7',
    at: '2026-10-08',
    source: 'USER',
    status: 'APPROVED',
    entry: 'insurance',
  },
  {
    id: 'c8',
    at: '2026-10-10',
    source: 'CLAUDE',
    status: 'APPROVED',
    entry: 'invoice',
  },
  {
    id: 'c9',
    at: '2026-10-10',
    source: 'USER',
    status: 'APPROVED',
    entry: 'retraction',
  },
  {
    id: 'c10',
    at: '2026-10-21',
    source: 'CLAUDE',
    status: 'DRAFT',
    entry: 'pipes',
  },
  {
    id: 'c11',
    at: '2026-10-28',
    source: 'IMPORT',
    status: 'APPROVED',
    entry: 'price',
  },
  {
    id: 'c12',
    at: '2026-11-02',
    source: 'USER',
    status: 'APPROVED',
    entry: 'bid',
  },
]

// Saved forecasts, so that one sees how the assessment of the house moved.
export const DEMO_FORECASTS = [
  {
    at: '2026-09-14',
    entry: 'listing',
    horizonYears: 15,
    low: 610_000,
    typical: 840_000,
    high: 1_290_000,
  },
  {
    at: '2026-10-03',
    entry: 'inspection',
    horizonYears: 15,
    low: 880_000,
    typical: 1_060_000,
    high: 1_420_000,
  },
  {
    at: '2026-10-12',
    entry: 'horizon',
    horizonYears: 20,
    low: 1_190_000,
    typical: 1_410_000,
    high: 1_830_000,
  },
]
