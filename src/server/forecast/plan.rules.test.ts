// The rules added for the library gaps (CLAUDE.md, "Regler för
// beräkningen"): the earliest year of a type, partial renovations, parts
// assumed from other parts, shares and usual quantities, the basement in
// the footprint, and the flags for a default profile and a part of another
// building at top level.
import { describe, expect, it } from 'vitest'
import type { ComponentView, KeyValueView } from '@/server/houses/getHouse'
import { flagText } from './flags'
import { withAnswer } from './whatIf'
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

  const due = (values: Record<string, unknown>, l = library) => {
    const [p] = planComponents([comp('kitchen', values)], house, l, START)
    return { plan: p, year: p.installYear.typical + p.lifespan.typical }
  }

  it('gives a third of a lifespan from the partial renovation', () => {
    // New fronts in 2025 on a kitchen from 1996, lifespan 30: 2025 + 10.
    const { plan, year } = due({
      installation_year: 1996,
      partial_renovation_year: 2025,
    })
    expect(year).toBe(2035)
    expect(codes(plan)).toContain('partial_renovation')
    expect(plan.flags.map(flagText).join()).toContain('33 % of a lifespan')
  })

  it('does not reward a part for being old when it was renovated', () => {
    // A kitchen from 1967 gets no more from new worktops than one from 1996.
    expect(
      due({ installation_year: 1967, partial_renovation_year: 2026 }).year
    ).toBe(2036)
    expect(
      due({ installation_year: 1996, partial_renovation_year: 2026 }).year
    ).toBe(2036)
  })

  it('takes a part out of being overdue, with the type’s own share', () => {
    // A new motor in 2021 in an FTX unit from 1989, lifespan 18.
    const ftx = lib(
      [['ventilation_ftx', { partialRenovationShare: 0.5 }]],
      [
        profile({
          type: 'ventilation_ftx',
          lifespanMinYears: 12,
          lifespanTypicalYears: 18,
          lifespanMaxYears: 20,
        }),
      ]
    )
    const [p] = planComponents(
      [
        comp('ventilation_ftx', {
          installation_year: 1989,
          partial_renovation_year: 2021,
        }),
      ],
      house,
      ftx,
      START
    )
    expect(p.installYear.typical + p.lifespan.typical).toBe(2030)
    expect(p.flags.map(flagText).join()).toContain('50 % of a lifespan')
  })

  it('says so when the part’s own lifespan runs longer', () => {
    const { plan, year } = due({
      installation_year: 2010,
      partial_renovation_year: 2015,
    })
    expect(year).toBe(2040)
    expect(codes(plan)).toEqual(['partial_renovation_no_effect'])
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

describe('an assumed part that may not be needed', () => {
  const library = lib(
    [
      [
        'drainage',
        {
          assumeUndocumented: true,
          context: { foundation_type: 'foundation' },
          assumedOnlyInHigh: { foundation_type: ['slab_on_ground'] },
        },
      ],
    ],
    [
      profile({
        type: 'drainage',
        costUnit: 'HOUSE',
        costLowSek: 1000,
        costHighSek: 2000,
      }),
    ]
  )
  const drainage = (list: ComponentView[]) =>
    planComponents(list, house, library, START).find(
      (p) => p.type === 'drainage'
    )!
  const slab = comp('foundation', { foundation_type: 'slab_on_ground' })

  it('costs something in high only, and says so', () => {
    const p = drainage([slab])
    expect(p.cost).toEqual({ low: 0, typical: 0, high: 2000 })
    expect(p.flags.map((f) => f.code)).toContain('assumed_only_in_high')
  })

  it('costs in every scenario on another foundation, documented or answered', () => {
    const cost = { low: 1000, typical: 1500, high: 2000 }
    expect(
      drainage([comp('foundation', { foundation_type: 'basement' })]).cost
    ).toEqual(cost)
    expect(drainage([slab, comp('drainage')]).cost).toEqual(cost)
    const answered = withAnswer(
      [slab],
      { componentId: 'assumed:drainage', type: 'drainage' },
      'installation_year',
      2000
    )
    expect(drainage(answered).cost).toEqual(cost)
  })
})

describe('renewing the sections of a sewer', () => {
  const library = lib(
    [
      [
        'sewer_pipes',
        {
          assumeUndocumented: true,
          context: { foundation_type: 'foundation' },
          assumeVariants: [
            {
              values: { section: 'under_slab' },
              whenContext: { foundation_type: ['slab_on_ground'] },
              plainValues: { section: 'indoor' },
            },
          ],
          profileKeyOrder: ['renovation_method', 'section'],
          cheaperRenewal: {
            when: {},
            match: { renovation_method: 'relined' },
          },
        },
      ],
    ],
    [
      profile({ type: 'sewer_pipes', costUnit: 'HOUSE' }),
      profile({
        type: 'sewer_pipes',
        costUnit: 'HOUSE',
        match: { section: 'under_slab' },
      }),
      ...[
        [{}, 500],
        [{ section: 'indoor' }, 100],
        [{ section: 'under_slab' }, 200],
      ].map(([match, cost]) =>
        profile({
          type: 'sewer_pipes',
          costUnit: 'HOUSE',
          match: {
            renovation_method: 'relined',
            ...(match as Record<string, string>),
          },
          costLowSek: cost as number,
          costHighSek: cost as number,
        })
      ),
    ]
  )
  const renewal = (foundation_type: string) =>
    Object.fromEntries(
      planComponents(
        [comp('foundation', { foundation_type })],
        house,
        library,
        START
      )
        .filter((p) => p.type === 'sewer_pipes')
        .map((p) => [p.componentId, p.renewal?.cost.typical])
    )

  it('prices a slab house per section, so they add up to one job', () => {
    expect(renewal('slab_on_ground')).toEqual({
      'assumed:sewer_pipes': 100,
      'assumed:sewer_pipes:section=under_slab': 200,
    })
  })

  it('prices the single part of any other house as the whole', () => {
    expect(renewal('basement')).toEqual({ 'assumed:sewer_pipes': 500 })
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

  it('assumes far less for entrance steps than for a terrace', () => {
    const library = lib(
      [['deck', { assumedQuantity: 25, assumedEntranceQuantity: 5 }]],
      [profile({ type: 'deck', costUnit: 'M2' })]
    )
    const quantity = (name: string, values = {}) =>
      planComponents([comp('deck', values, { name })], house, library, START)[0]
        .quantity
    expect(quantity('Entrébro')).toBe(5)
    expect(quantity('Farstubro')).toBe(5)
    expect(quantity('Altan')).toBe(25)
    expect(quantity('Altan och entrébro')).toBe(25)
    expect(quantity('Entrébro', { area: 8 })).toBe(8)
  })

  describe('parts under a building of their own', () => {
    const library = lib(
      [
        ['garage', { separateBuilding: true, assumedQuantity: 30 }],
        ['shed', { separateBuilding: true }],
        [
          'roof_covering',
          { quantityFromFootprint: { basis: 'area', factor: 1.3 } },
        ],
        ['facade', { quantityFromFootprint: { basis: 'wall', factor: 2.7 } }],
      ],
      [
        profile({ type: 'roof_covering', costUnit: 'M2' }),
        profile({ type: 'facade', costUnit: 'M2' }),
      ]
    )
    const values = [...house, kv('floor_count', 1)]
    const plan = (building: ComponentView) =>
      Object.fromEntries(
        planComponents([building], values, library, START)
          .filter((p) => !p.assumed)
          .map((p) => [p.name ?? p.type, p])
      )
    const roof = comp('roof_covering')
    const facade = comp('facade')

    it('are estimated from the building’s area, as one storey', () => {
      const parts = plan(
        comp('garage', { area: 36 }, { children: [roof, facade] })
      )
      expect(parts.roof_covering.quantity).toBeCloseTo(1.3 * 36)
      // 6 × 6 m: 24 m of wall, 2.7 m high.
      expect(parts.facade.quantity).toBeCloseTo(2.7 * 24)
      expect(parts.roof_covering.flags.map(flagText)).toContain(
        "area estimated from the building's 36 m2"
      )
      expect(parts.roof_covering.cost?.typical).toBeGreaterThan(0)
    })

    it('take a usual size when the building states none', () => {
      const parts = plan(comp('garage', {}, { children: [roof] }))
      expect(parts.roof_covering.quantity).toBeCloseTo(1.3 * 30)
      expect(codes(parts.roof_covering)).toContain(
        'quantity_from_usual_building'
      )
    })

    it('keep their own area and share what the others do not state', () => {
      const parts = plan(
        comp(
          'garage',
          { area: 50 },
          {
            children: [
              comp('roof_covering', { area: 40 }, { name: 'own' }),
              comp('roof_covering', {}, { name: 'rest' }),
            ],
          }
        )
      )
      expect(parts.own.quantity).toBe(40)
      expect(parts.rest.quantity).toBeCloseTo(1.3 * 50 - 40)
    })

    describe('when nothing registers them', () => {
      const assuming = lib(
        [
          ...library.defaults,
          [
            'garage',
            {
              separateBuilding: true,
              assumedQuantity: 30,
              assumeParts: ['roof_covering', 'facade'],
            },
          ],
          [
            'carport',
            {
              separateBuilding: true,
              assumedQuantity: 30,
              assumeParts: ['roof_covering'],
            },
          ],
        ],
        library.profiles
      )
      const plans = (...list: ComponentView[]) =>
        planComponents(list, values, assuming, START)
      const ofBuilding = (id: string) => (p: { componentId: string }) =>
        p.componentId.endsWith(`building=${id}`)

      it('assumes a bare garage’s roof and facade from its area', () => {
        const garage = comp('garage', { area: 36 }, { name: 'Kallgarage' })
        const parts = plans(garage).filter(ofBuilding(garage.id))
        expect(parts.map((p) => p.type)).toEqual(['roof_covering', 'facade'])
        expect(parts[0]).toMatchObject({
          assumed: true,
          basis: 'assumed',
          name: 'Kallgarage',
        })
        expect(parts[0].quantity).toBeCloseTo(1.3 * 36)
        expect(codes(parts[0])).toContain('assumed_building_part')
        expect(codes(parts[0])).not.toContain('assumed_part')
      })

      it('assumes only what is missing, and only a roof on a carport', () => {
        const garage = comp('garage', {}, { children: [comp('facade')] })
        const carport = comp('carport')
        const list = plans(garage, carport)
        expect(list.filter(ofBuilding(garage.id)).map((p) => p.type)).toEqual([
          'roof_covering',
        ])
        expect(list.filter(ofBuilding(carport.id)).map((p) => p.type)).toEqual([
          'roof_covering',
        ])
      })

      it('counts a roof named for the building at top level only once', () => {
        const garage = comp('garage')
        const list = plans(
          garage,
          comp('roof_covering', {}, { name: 'Tak, garage' })
        )
        expect(list.filter(ofBuilding(garage.id)).map((p) => p.type)).toEqual([
          'facade',
        ])
      })

      it('does not count a part as old as the house', () => {
        const garage = comp('garage')
        const [roof] = plans(garage).filter(ofBuilding(garage.id))
        // Typical is halfway through the lifespan of 30, not 1979.
        expect(roof.installYear).toEqual({
          low: START,
          typical: START - 15,
          high: START - 20,
        })
        expect(codes(roof)).toContain('installation_year_unknown')
        expect(codes(roof)).not.toContain('construction_year_used')
        // A registered part without a year reads the same.
        const [own] = plans(comp('garage', {}, { children: [comp('facade')] }))
          .filter((p) => p.type === 'facade')
          .filter((p) => !p.assumed)
        expect(own.basis).toBe('unknown_year')
      })

      it('counts three walls on an attached garage', () => {
        const wall = (values: Record<string, unknown>) => {
          const garage = comp('garage', { area: 36, ...values })
          return plans(garage)
            .filter(ofBuilding(garage.id))
            .filter((p) => p.type === 'facade' || p.type === 'roof_covering')
        }
        const [roof, facade] = wall({ attached: true })
        expect(facade.quantity).toBeCloseTo(2.7 * 24 * 0.75)
        expect(codes(facade)).toContain('attached_wall_shared')
        // The roof is the building's whole, and a detached garage all walls.
        expect(roof.quantity).toBeCloseTo(1.3 * 36)
        expect(codes(roof)).not.toContain('attached_wall_shared')
        expect(wall({ attached: false })[1].quantity).toBeCloseTo(2.7 * 24)
      })

      it('counts from the building’s own year', () => {
        const garage = comp('garage', { installation_year: 2015 })
        const [part] = plans(garage).filter(ofBuilding(garage.id))
        expect(part.installYear.typical).toBe(2015)
        expect(codes(part)).toContain('building_year_used')
      })

      it('keeps a part tried with an answer under its building', () => {
        const garage = comp('garage', { area: 36 })
        const [assumed] = plans(garage).filter(ofBuilding(garage.id))
        const answered = withAnswer(
          [garage],
          { componentId: assumed.componentId, type: assumed.type },
          'installation_year',
          2000
        )
        const list = plans(...answered)
        const part = list.find((p) => p.componentId === assumed.componentId)!
        expect(part.installYear.typical).toBe(2000)
        expect(part.quantity).toBeCloseTo(1.3 * 36)
        // Not doubled by a second assumption, and not the house's roof.
        expect(list.filter(ofBuilding(garage.id))).toHaveLength(2)
      })
    })

    it('stay without a cost and say so when nothing gives a size', () => {
      const parts = plan(comp('shed', {}, { children: [roof] }))
      expect(parts.roof_covering.cost).toBeNull()
      expect(parts.roof_covering.flags.map(flagText)).toContain(
        'area missing; no cost'
      )
    })
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
