// Repainting of painted wood (CLAUDE.md, "Regler för beräkningen"): the
// interval per paint type and the repaint figures of the profiles for wood
// facades, wooden windows and exterior doors. Researched 2026-11-01.
//
// Intervals are for opaque paint on a wooden facade unless noted. South and
// west walls wear fastest; the figures are for the house as a whole.
// Costs are per m2 of facade or per window or door, 2026, incl. VAT and
// before ROT, washing, scraping, priming and two coats with paint included.
// Scaffolding is not included: Son och Far gives 0-5 000 kr for one storey,
// 10 000-20 000 for 1.5 and 15 000-35 000 for two.
import type {
  ComponentTypeDefinition,
  LifespanProfileDefinition,
} from '../../src/server/library/schema.ts'

type Source = LifespanProfileDefinition['sources'][number]
type Interval = NonNullable<
  NonNullable<ComponentTypeDefinition['forecastDefaults']>['repaintByPaintType']
>[string]

const TRAGUIDEN =
  'https://www.traguiden.se/underhall/ytbehandling-och-underhall/utforande---utvandigt/ommalning-och-underhall--generellt/beraknade-underhallsintervall/'
const BYGGAHUS_HOW_OFTEN =
  'https://www.byggahus.se/renovera/hur-ofta-mala-om-huset'
const BYGGAHUS_COST =
  'https://www.byggahus.se/renovera/vad-kostar-det-att-mala-fasaden'
const COLORAMA =
  'https://www.colorama.se/inspiration/mala/mala-utomhus/sa-malar-du-om-trafasaden-till-huset'
const ANDRES =
  'https://www.andresmaleri.se/kunskap/fasadmalning/hur-ofta-mala-om-fasaden'
const SON_OCH_FAR_FACADE = 'https://sonochfar.se/blog/mala-fasad-pris-kvm/'
const SON_OCH_FAR_WINDOW =
  'https://sonochfar.se/blog/mala-fonster-utvandigt-pris/'
const BULLERBY =
  'https://www.bullerby.se/artiklar/vad-kostar-det-att-renovera-mala-om-fonster'
const BYGGKOSTNADER = 'https://byggkostnader.se/malning/'
const HANDYMANS =
  'https://handymans.se/guider/vad-kostar-det-att-mala-om-huset/'
const NLL_FACADE = 'https://nllmaleri.se/pris/trafasadmalning/'
const NLL_JOINERY = 'https://nllmaleri.se/pris/fonster-dorrar/'

const interval = (
  name: string,
  url: string,
  range: [number, number],
  note: string
): Source => ({
  name,
  url,
  about: 'repaint',
  lifespanYears: null,
  lifespanYearsRange: range,
  costSek: null,
  note,
})

const cost = (
  name: string,
  url: string,
  range: [number, number],
  note: string
): Source => ({
  name,
  url,
  about: 'repaint',
  lifespanYears: null,
  costSek: null,
  costSekRange: range,
  note,
})

// TräGuiden (Svenskt Trä) was last updated 2015; Son och Far quotes the same
// table in 2026. Colorama and Andrés Måleri are optimistic for linseed oil.
export const facadeRepaintByPaintType: Record<string, Interval> = {
  linseed_oil: {
    minYears: 8,
    typicalYears: 10,
    maxYears: 12,
    sources: [
      interval(
        'TräGuiden (Svenskt Trä), tabell 1',
        TRAGUIDEN,
        [8, 11],
        'Linoljefärg, träfasad; updated 2015'
      ),
      interval(
        'Byggahus, Hur ofta måla om huset? (RISE, Beckers)',
        BYGGAHUS_HOW_OFTEN,
        [8, 10],
        'Updated 2026-06-19'
      ),
      interval(
        'Falu Rödfärg, produktblad Träfasad',
        'https://falurodfarg.com/wp-content/uploads/2026/06/Produktblad_trafasad.pdf',
        [10, 12],
        'Waterborne linseed-oil paint, normal conditions'
      ),
      interval(
        'Colorama, Så målar du din träfasad',
        COLORAMA,
        [10, 15],
        'Paint retailer; undated'
      ),
    ],
  },
  alkyd_oil: {
    minYears: 8,
    typicalYears: 10,
    maxYears: 12,
    sources: [
      interval(
        'TräGuiden (Svenskt Trä), tabell 1',
        TRAGUIDEN,
        [9, 12],
        'Alkydoljefärg, träfasad; updated 2015'
      ),
      interval(
        'Byggahus, Hur ofta måla om huset? (RISE, Beckers)',
        BYGGAHUS_HOW_OFTEN,
        [10, 10],
        'Updated 2026-06-19'
      ),
      interval(
        'Byggahus, Vad kostar det att måla fasaden? (Optimera)',
        BYGGAHUS_COST,
        [8, 8],
        'Paint seller; updated 2025-05-20'
      ),
      interval(
        'Colorama, Så målar du din träfasad',
        COLORAMA,
        [8, 8],
        'Paint retailer; undated'
      ),
    ],
  },
  acrylic: {
    minYears: 12,
    typicalYears: 13,
    maxYears: 15,
    sources: [
      interval(
        'TräGuiden (Svenskt Trä), tabell 1',
        TRAGUIDEN,
        [12, 15],
        'Akrylatfärg, träfasad; updated 2015'
      ),
      interval(
        'Byggahus, Hur ofta måla om huset? (RISE, Beckers)',
        BYGGAHUS_HOW_OFTEN,
        [12, 15],
        'Updated 2026-06-19'
      ),
      interval(
        'Byggahus, Vad kostar det att måla fasaden? (Optimera)',
        BYGGAHUS_COST,
        [12, 16],
        'Acrylic and emulsion paint; paint seller; 2025-05-20'
      ),
      interval(
        'Colorama, Så målar du din träfasad',
        COLORAMA,
        [12, 16],
        'Paint retailer; undated'
      ),
      interval(
        'Andrés Måleri, Hur ofta ska man måla om fasaden?',
        ANDRES,
        [8, 12],
        'Painting firm, 2026-07-20; south and west sides sooner'
      ),
    ],
  },
  slurry_paint: {
    minYears: 6,
    typicalYears: 8,
    maxYears: 10,
    sources: [
      interval(
        'Falu Rödfärg, produktblad Original',
        'https://falurodfarg.com/wp-content/uploads/2026/06/Produktblad_Original.pdf',
        [8, 10],
        'Manufacturer, normal conditions; black may be shorter'
      ),
      interval(
        'TräGuiden (Svenskt Trä), tabell 1',
        TRAGUIDEN,
        [7, 10],
        'Slamfärg, träfasad; updated 2015'
      ),
      interval(
        'Byggahus, Hur ofta måla om huset? (RISE, Beckers)',
        BYGGAHUS_HOW_OFTEN,
        [6, 8],
        'Updated 2026-06-19'
      ),
      interval(
        'Bauhaus, Falu Vapen Röd slamfärg',
        'https://www.bauhaus.se/slamfarg-falu-vapen-rod-10l-625679',
        [8, 12],
        'Retailer product data'
      ),
      interval(
        'Colorama, Så målar du din träfasad',
        COLORAMA,
        [5, 8],
        'Paint retailer; undated'
      ),
    ],
  },
  stain: {
    minYears: 3,
    typicalYears: 4,
    maxYears: 5,
    sources: [
      interval(
        'TräGuiden (Svenskt Trä), tabell 1',
        TRAGUIDEN,
        [4, 5],
        'Semi-transparent stain, träfasad; no figure for opaque stain'
      ),
      interval(
        'Byggahus, Hur ofta måla om huset? (RISE, Beckers)',
        BYGGAHUS_HOW_OFTEN,
        [3, 5],
        'Stain type not stated; 2026-06-19'
      ),
    ],
  },
}

// Stained windows and doors (TräGuiden tabell 2); opaque paint of any type
// uses the profile's interval.
const joineryStain: Interval = {
  minYears: 2,
  typicalYears: 3,
  maxYears: 4,
  sources: [
    interval(
      'TräGuiden (Svenskt Trä), tabell 2',
      TRAGUIDEN,
      [2, 4],
      'Stained wooden windows and exterior doors; updated 2015'
    ),
  ],
}
export const joineryRepaintByPaintType: Record<string, Interval> = {
  stain: joineryStain,
}

// Repaint figures for the wood facade profile. The low cost sources
// (Byggkostnader, Handymans 150-350) sit below the painting firms' own
// prices; NLL (Skåne) is labour only and the highest.
export const woodFacadeRepaint = {
  repaintMinYears: 7,
  repaintTypicalYears: 10,
  repaintMaxYears: 12,
  repaintCostLowSek: 350,
  repaintCostHighSek: 700,
}
export const woodFacadeRepaintSources: Source[] = [
  interval(
    'Vi i Villa, Så målar du om trä-, betong- och putsfasad',
    'https://viivilla.se/inredning/farglara/sa-malar-du-om-tra-betong-och-putsfasad/',
    [7, 7],
    'Paint type not stated; 2025-06-27'
  ),
  interval(
    'Byggkostnader.se, Vad kostar målning? Priser 2026',
    BYGGKOSTNADER,
    [8, 12],
    'South side wears fastest; 2026-04-03'
  ),
  interval(
    'Handymans, Vad kostar det att måla om huset?',
    HANDYMANS,
    [8, 15],
    'Quote-comparison site; 2026-08'
  ),
  cost(
    'Son och Far, Måla fasad pris per kvm 2026 (gott skick)',
    SON_OCH_FAR_FACADE,
    [360, 460],
    'Incl. VAT before ROT; scaffolding extra'
  ),
  cost(
    'Son och Far, Måla fasad pris per kvm 2026 (normalt skick)',
    SON_OCH_FAR_FACADE,
    [490, 640],
    'Incl. VAT before ROT; scaffolding extra'
  ),
  cost(
    'Son och Far, Måla fasad pris per kvm 2026 (dåligt skick)',
    SON_OCH_FAR_FACADE,
    [680, 880],
    'Heavy scraping and priming; scaffolding extra'
  ),
  cost(
    'NLL Måleri, Träfasad målning pris 2026',
    NLL_FACADE,
    [625, 875],
    'Labour only, incl. VAT before ROT; paint 188-250 kr/m2 extra'
  ),
  cost(
    'Byggkostnader.se, Vad kostar målning? Priser 2026',
    BYGGKOSTNADER,
    [150, 350],
    'VAT not stated; before ROT'
  ),
  cost(
    'Handymans, Vad kostar det att måla om huset?',
    HANDYMANS,
    [150, 300],
    'Incl. VAT before ROT'
  ),
]

// Exterior repaint of a wooden window, not a full renovation (Offerta
// 2 000-3 500, every 20-25 years per TräGuiden).
export const woodWindowRepaint = {
  repaintMinYears: 5,
  repaintTypicalYears: 8,
  repaintMaxYears: 12,
  repaintCostLowSek: 700,
  repaintCostHighSek: 2500,
}
export const woodWindowRepaintSources: Source[] = [
  interval(
    'TräGuiden (Svenskt Trä), tabell 2',
    TRAGUIDEN,
    [5, 10],
    'Opaque-painted wooden windows and doors; full renovation every 20-25 years'
  ),
  interval(
    'Son och Far, Måla fönster utvändigt pris 2026',
    SON_OCH_FAR_WINDOW,
    [5, 10],
    'Painting firm'
  ),
  interval(
    'Bullerbymålarna, Renovera eller måla om fönster 2026',
    BULLERBY,
    [8, 12],
    'Painting firm, 2026-02-27'
  ),
  cost(
    'Son och Far, Måla fönster utvändigt pris 2026',
    SON_OCH_FAR_WINDOW,
    [700, 1500],
    'Simple exterior repaint before ROT; 1 500-2 500 with putty'
  ),
  cost(
    'Offerta, Vad kostar det att renovera fönster? 2026',
    'https://offerta.se/guider/bygg-och-renovering/vad-kostar-det-att-renovera-fonster',
    [700, 2500],
    'Målning av fönster, per window; 2026-08-25'
  ),
  cost(
    'Byggkostnader.se, Vad kostar målning? Priser 2026',
    BYGGKOSTNADER,
    [800, 2500],
    'Incl. putty and primer; VAT not stated'
  ),
  cost(
    'Bullerbymålarna, Renovera eller måla om fönster 2026',
    BULLERBY,
    [600, 1200],
    'After ROT, labour and paint included'
  ),
]

// One interval source only, the same TräGuiden row as windows.
export const doorRepaint = {
  repaintMinYears: 5,
  repaintTypicalYears: 7,
  repaintMaxYears: 10,
  repaintCostLowSek: 1500,
  repaintCostHighSek: 4000,
}
export const doorRepaintSources: Source[] = [
  interval(
    'TräGuiden (Svenskt Trä), tabell 2',
    TRAGUIDEN,
    [5, 10],
    'Opaque-painted wooden windows and exterior doors'
  ),
  cost(
    'Byggkostnader.se, Vad kostar målning? Priser 2026',
    BYGGKOSTNADER,
    [1500, 3000],
    'Ytterdörr; VAT not stated'
  ),
  cost(
    'NLL Måleri, Måla fönster och dörrar: pris',
    NLL_JOINERY,
    [2500, 4375],
    'Door with repair, labour only, incl. VAT before ROT'
  ),
]
