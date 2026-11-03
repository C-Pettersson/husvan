// The rules added for the library gaps (CLAUDE.md, "Regler för
// beräkningen"): the earliest year of a type, partial renovations, parts
// assumed from other parts, shares and usual quantities, the basement in
// the footprint, and the flags for a default profile and a part of another
// building at top level.
import { describe, expect, it } from 'vitest'
import type { ComponentView, KeyValueView } from '@/server/houses/getHouse'
import { flagText } from './flags'
import {
  assumedId,
  parseAssumedId,
  planComponents,
  type ForecastDefaults,
  type Library,
  type ProfileRow,
} from './plan'

let n = 0
const kv = (key: string, value: unknown): KeyValueView => ({
  key,
  current: {
    id: `o${n++}`,
    key,
    value: value as never,
    unit: null,
    source: 'CLAUDE',
    confidence: 0.9,
    quote: null,
    documentId: null,
    recordedAt: new Date(0),
    draft: false,
  },
  alternatives: [],
})
const comp = (
  type: string,
  values: Record<string, unknown> = {},
  more: Partial<ComponentView> = {}
): ComponentView => ({
  id: `c${n++}`,
  type,
  name: null,
  draft: false,
  values: Object.entries(values).map(([k, v]) => kv(k, v)),
  children: [],
  ...more,
})
const profile = (p: Partial<ProfileRow>): ProfileRow => ({
  type: 'x',
  match: {},
  lifespanMinYears: 20,
  lifespanTypicalYears: 30,
  lifespanMaxYears: 40,
  costLowSek: 1000,
  costHighSek: 1000,
  costUnit: 'EACH',
  priceYear: 2026,
  repaintMinYears: null,
  repaintTypicalYears: null,
  repaintMaxYears: null,
  repaintCostLowSek: null,
  repaintCostHighSek: null,
  ...p,
})
const lib = (
  defaults: [string, ForecastDefaults][],
  profiles: ProfileRow[]
): Library => ({
  defaults: new Map(defaults),
  profiles,
  indexFactor: () => 1,
})
const START = 2026
const house = [kv('construction_year', 1979), kv('living_area', 100)]
const codes = (p: { flags: { code: string }[] }) => p.flags.map((f) => f.code)

describe('earliest year of a type', () => {
  const library = lib(
    [['ev_charger', { earliestYear: 2010 }]],
    [profile({ type: 'ev_charger', lifespanTypicalYears: 15 })]
  )

  it('counts a part without a year from the type’s earliest year, not 1979', () => {
    const [p] = planComponents([comp('ev_charger')], house, library, START)
    expect(p.installYear).toEqual({ low: 2010, typical: 2010, high: 2010 })
    expect(p.basis).toBe('construction_year')
    expect(p.flags.map(flagText)).toContain(
      'installation_year missing; the type did not exist when the house was built, so it counts from 2010'
    )
  })

  it('keeps the construction year when it is later, and a documented year as it is', () => {
    const later = [kv('construction_year', 2015), kv('living_area', 100)]
    expect(
      planComponents([comp('ev_charger')], later, library, START)[0].installYear
        .typical
    ).toBe(2015)
    expect(
      planComponents(
        [comp('ev_charger', { installation_year: 2005 })],
        house,
        library,
        START
      )[0].installYear.typical
    ).toBe(2005)
  })

  it('does not reach before the earliest year when no year is known at all', () => {
    const [p] = planComponents(
      [comp('ev_charger')],
      [kv('living_area', 100)],
      library,
      START
    )
    expect(p.installYear.high).toBe(2010)
    expect(p.basis).toBe('unknown_year')
  })
})

describe('partial renovation', () => {
  const library = lib([], [profile({ type: 'kitchen' })])

  it('moves the part halfway towards new from the partial renovation', () => {
    const [p] = planComponents(
      [
        comp('kitchen', {
          installation_year: 1979,
          partial_renovation_year: 2003,
        }),
      ],
      house,
      library,
      START
    )
    // 1979 + 0.5 × (2003 − 1979) = 1991.
    expect(p.installYear.typical).toBe(1991)
    expect(codes(p)).toContain('partial_renovation')
  })

  it('ignores a partial renovation before the installation year', () => {
    const [p] = planComponents(
      [
        comp('kitchen', {
          installation_year: 2010,
          partial_renovation_year: 2003,
        }),
      ],
      house,
      library,
      START
    )
    expect(p.installYear.typical).toBe(2010)
    expect(codes(p)).not.toContain('partial_renovation')
  })
})

describe('parts assumed from other parts', () => {
  const library = lib(
    [
      [
        'hydronic_radiators',
        {
          assumeUndocumented: true,
          quantityPerLivingM2: 0.08,
          assumeWhenTypes: ['district_heating_substation'],
          assumeUnlessParts: [
            { type: 'underfloor_heating', where: { medium: ['water'] } },
          ],
        },
      ],
      [
        'chimney',
        { assumeUndocumented: true, assumeWhenTypes: ['wood_stove'] },
      ],
      [
        'sewer_pipes',
        {
          assumeUndocumented: true,
          context: { foundation_type: 'foundation' },
          assumeVariants: [
            {
              values: { section: 'under_slab' },
              whenContext: { foundation_type: ['slab_on_ground'] },
            },
          ],
        },
      ],
    ],
    [
      profile({ type: 'hydronic_radiators' }),
      profile({ type: 'chimney' }),
      profile({ type: 'sewer_pipes' }),
      profile({
        type: 'sewer_pipes',
        match: { section: 'under_slab' },
        costLowSek: 5000,
        costHighSek: 5000,
      }),
    ]
  )
  const ids = (list: ComponentView[]) =>
    planComponents(list, house, library, START).map((p) => p.componentId)
  const UNDER = 'assumed:sewer_pipes:section=under_slab'

  it('assumes radiators only with a water-borne source and no water floor heating', () => {
    expect(ids([])).not.toContain('assumed:hydronic_radiators')
    expect(ids([comp('district_heating_substation')])).toContain(
      'assumed:hydronic_radiators'
    )
    expect(
      ids([
        comp('district_heating_substation'),
        comp('underfloor_heating', { medium: 'water' }),
      ])
    ).not.toContain('assumed:hydronic_radiators')
    // Electric floor heating, or floor heating under a bathroom, is not the
    // distribution.
    expect(
      ids([
        comp('district_heating_substation'),
        comp('underfloor_heating', { medium: 'electric' }),
        comp(
          'bathroom',
          {},
          { children: [comp('underfloor_heating', { medium: 'water' })] }
        ),
      ])
    ).toContain('assumed:hydronic_radiators')
    // An unknown medium does not rule it out.
    expect(
      ids([comp('district_heating_substation'), comp('underfloor_heating')])
    ).not.toContain('assumed:hydronic_radiators')
  })

  it('assumes a chimney with a stove, never without', () => {
    expect(ids([comp('wood_stove')])).toContain('assumed:chimney')
    expect(ids([comp('wood_stove'), comp('chimney')])).not.toContain(
      'assumed:chimney'
    )
    expect(ids([])).not.toContain('assumed:chimney')
  })

  it('assumes the sewer under the slab on a slab on ground, with its own profile', () => {
    const slab = comp('foundation', { foundation_type: 'slab_on_ground' })
    const plans = planComponents(
      [slab, comp('sewer_pipes', { section: 'indoor' })],
      house,
      library,
      START
    )
    const under = plans.find(
      (p) =>
        p.componentId === assumedId('sewer_pipes', { section: 'under_slab' })
    )!
    expect(under).toMatchObject({
      assumed: true,
      profile: { section: 'under_slab' },
      cost: { typical: 5000 },
    })
    // Documented under the slab, or no slab: nothing assumed.
    expect(
      ids([slab, comp('sewer_pipes', { section: 'under_slab' })])
    ).not.toContain(UNDER)
    expect(
      ids([
        comp('foundation', { foundation_type: 'basement' }),
        comp('sewer_pipes'),
      ])
    ).not.toContain(UNDER)
    // Without any sewer, the plain part and the variant are both assumed.
    expect(ids([slab])).toEqual(
      expect.arrayContaining(['assumed:sewer_pipes', UNDER])
    )
  })

  it('names and parses assumed ids', () => {
    expect(parseAssumedId(UNDER)).toEqual({
      type: 'sewer_pipes',
      values: { section: 'under_slab' },
    })
    expect(parseAssumedId('assumed:roof_covering')).toEqual({
      type: 'roof_covering',
      values: {},
    })
    expect(parseAssumedId('c1')).toBeNull()
  })
})

describe('quantities', () => {
  const facadeLib = lib(
    [['facade', { quantityPerLivingM2: 1 }]],
    [profile({ type: 'facade', costUnit: 'M2' })]
  )

  it('splits an estimated area by share where the parts state one', () => {
    const plans = planComponents(
      [comp('facade', { share: 0.7 }), comp('facade', { share: 0.3 })],
      house,
      facadeLib,
      START
    )
    expect(plans.map((p) => p.quantity)).toEqual([70, 30])
    expect(plans[0].flags.map(flagText)).toContain(
      "area as share 0.7 of the house's estimated whole"
    )
  })

  it('gives what the shares leave to the parts without a share or an area', () => {
    const plans = planComponents(
      [
        comp('facade', { share: 0.5 }),
        comp('facade'),
        comp('facade', { area: 10 }),
      ],
      house,
      facadeLib,
      START
    )
    // 100 × (1 − 0.5) − 10 stated = 40 for the one that states nothing.
    expect(plans.map((p) => p.quantity)).toEqual([50, 40, 10])
  })

  it('assumes a usual quantity where nothing else can be estimated', () => {
    const library = lib(
      [['deck', { assumedQuantity: 25 }]],
      [profile({ type: 'deck', costUnit: 'M2' })]
    )
    const [p] = planComponents([comp('deck')], house, library, START)
    expect(p.quantity).toBe(25)
    expect(p.flags.map(flagText)).toContain('area missing; a usual 25 assumed')
  })

  it('takes a basement into the footprint', () => {
    const library = lib(
      [
        [
          'roof_covering',
          { quantityFromFootprint: { basis: 'area', factor: 1 } },
        ],
      ],
      [profile({ type: 'roof_covering', costUnit: 'M2' })]
    )
    const values = [...house, kv('secondary_area', 80), kv('floor_count', 1)]
    const roof = () => comp('roof_covering')
    const [withBasement] = planComponents(
      [comp('foundation', { foundation_type: 'basement' }), roof()],
      values,
      library,
      START
    )
    expect(withBasement.quantity).toBe(90) // (100 + 80) / 2
    expect(codes(withBasement)).toContain('footprint_includes_secondary_area')
    const [slab] = planComponents(
      [comp('foundation', { foundation_type: 'slab_on_ground' }), roof()],
      values,
      library,
      START
    )
    expect(slab.quantity).toBe(100)
  })
})

describe('what the flags say about profiles and other buildings', () => {
  it('says when the default profile stands in for an unknown attribute', () => {
    const library = lib(
      [],
      [
        profile({
          type: 'driveway',
          costUnit: 'M2',
          costLowSek: 500,
          costHighSek: 2500,
        }),
        profile({
          type: 'driveway',
          match: { surface: 'asphalt' },
          costUnit: 'M2',
        }),
      ]
    )
    const [unknown, known] = planComponents(
      [
        comp('driveway', { area: 10 }),
        comp('driveway', { area: 10, surface: 'asphalt' }),
      ],
      house,
      library,
      START
    )
    expect(unknown.flags.map(flagText)).toContain(
      "surface unknown; the type's default profile with its wide range is used"
    )
    expect(unknown.cost).toEqual({ low: 5000, typical: 15000, high: 25000 })
    expect(codes(known)).not.toContain('profile_default_used')
  })

  it('flags a roof at top level that by its name belongs to the garage', () => {
    const library = lib(
      [
        ['roof_covering', { quantityPerLivingM2: 1 }],
        ['garage', { separateBuilding: true }],
      ],
      [profile({ type: 'roof_covering', costUnit: 'M2' })]
    )
    const plans = planComponents(
      [
        comp('roof_covering', {}, { name: 'Sadeltak, bostadshus' }),
        comp('roof_covering', {}, { name: 'Tak, garage' }),
        comp(
          'garage',
          {},
          {
            children: [
              comp('roof_covering', { area: 30 }, { name: 'Tak, garage' }),
            ],
          }
        ),
      ],
      house,
      library,
      START
    )
    expect(
      plans.map((p) => codes(p).includes('looks_like_other_building'))
    ).toEqual([false, true, false])
  })
})
