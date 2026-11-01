import { describe, expect, it } from 'vitest'
import type { ComponentView, KeyValueView } from '@/server/houses/getHouse'
import { annualCost } from './annual'
import { explainDifference, maintenanceDebt } from './debt'
import { computeForecast, schedule, type WorkItemInput } from './forecast'
import { findingsByType } from './findings'
import { flagText } from './flags'
import { planComponents, type Library, type ProfileRow } from './plan'
import { runningCosts } from './running'

let n = 0
const kv = (key: string, value: unknown, confidence = 0.9): KeyValueView => ({
  key,
  current: {
    id: `o${n++}`,
    key,
    value: value as never,
    unit: null,
    source: 'CLAUDE',
    confidence,
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
  id = `c${n++}`
): ComponentView => ({
  id,
  type,
  name: null,
  draft: false,
  values: Object.entries(values).map(([k, v]) => kv(k, v)),
  children: [],
})

const profile = (p: Partial<ProfileRow>): ProfileRow => ({
  type: 'roof_covering',
  match: {},
  lifespanMinYears: 30,
  lifespanTypicalYears: 40,
  lifespanMaxYears: 50,
  costLowSek: 1000,
  costHighSek: 2000,
  costUnit: 'M2',
  priceYear: 2026,
  repaintMinYears: null,
  repaintTypicalYears: null,
  repaintMaxYears: null,
  repaintCostLowSek: null,
  repaintCostHighSek: null,
  ...p,
})

const library: Library = {
  defaults: new Map([
    ['window', { quantityPerLivingM2: 0.1 }],
    [
      'sewer_pipes',
      {
        profileKeyOrder: ['renovation_method', 'material'],
        cheaperRenewal: {
          when: { material: ['cast_iron'] },
          match: { renovation_method: 'relined' },
        },
        inspection: {
          costLowSek: 3000,
          costHighSek: 8000,
          priceYear: 2026,
          sources: [{ name: 'x', url: 'https://example.com' }],
        },
      },
    ],
    [
      'facade',
      {
        repaintByPaintType: {
          slurry_paint: {
            minYears: 6,
            typicalYears: 8,
            maxYears: 10,
            sources: [{ name: 'x', url: 'https://example.com' }],
          },
        },
      },
    ],
  ]),
  profiles: [
    profile({}),
    profile({
      type: 'window',
      costUnit: 'EACH',
      costLowSek: 10000,
      costHighSek: 10000,
    }),
    profile({
      type: 'facade',
      costLowSek: 2000,
      costHighSek: 2000,
      repaintMinYears: 8,
      repaintTypicalYears: 10,
      repaintMaxYears: 12,
      repaintCostLowSek: 400,
      repaintCostHighSek: 400,
    }),
    profile({ type: 'sewer_pipes', costUnit: 'EACH' }),
    profile({
      type: 'sewer_pipes',
      match: { material: 'cast_iron' },
      lifespanMinYears: 30,
      lifespanTypicalYears: 50,
      lifespanMaxYears: 80,
      costLowSek: 120000,
      costHighSek: 220000,
      costUnit: 'EACH',
    }),
    profile({
      type: 'sewer_pipes',
      match: { renovation_method: 'relined' },
      lifespanMinYears: 15,
      lifespanTypicalYears: 30,
      lifespanMaxYears: 50,
      costLowSek: 50000,
      costHighSek: 250000,
      costUnit: 'EACH',
    }),
  ],
  indexFactor: (year) => (year === 2020 ? 1.1 : 1),
}

const START = 2026
const house = [kv('construction_year', 1990), kv('living_area', 120)]
const plan = (c: ComponentView, values = house) =>
  planComponents([c], values, library, START)[0]

describe('planComponents', () => {
  it('uses installation year, condition and quantity', () => {
    const p = plan(
      comp('roof_covering', {
        installation_year: 2000,
        condition: 5,
        area: 150,
      })
    )
    expect(p.installYear.typical).toBe(2000)
    expect(p.lifespan).toEqual({ low: 50, typical: 50, high: 30 })
    expect(p.cost).toEqual({ low: 150000, typical: 225000, high: 300000 })
    expect(p.flags).toEqual([])
  })

  it('falls back to the construction year and estimates quantity', () => {
    const p = plan(comp('window'))
    expect(p.installYear.typical).toBe(1990)
    expect(p.quantity).toBe(12)
    expect(p.flags.map(flagText)).toEqual([
      'installation_year missing; construction_year used',
      'quantity estimated from living_area',
    ])
  })

  it('shares the estimate among windows without a quantity', () => {
    const quantities = (...windows: ComponentView[]) =>
      planComponents(windows, house, library, START).map((p) => p.quantity)
    // 0.1 per m2 of 120 m2 is 12 windows.
    expect(quantities(comp('window'), comp('window'))).toEqual([6, 6])
    expect(
      quantities(comp('window', { quantity: 10 }), comp('window'))
    ).toEqual([10, 2])
    const plans = planComponents(
      [comp('window', { quantity: 12 }), comp('window')],
      house,
      library,
      START
    )
    expect(plans[1].quantity).toBe(1)
    expect(plans[1].flags.map(flagText)).toContain(
      'quantity missing; 1 assumed'
    )
  })

  it('costs nothing without an area to multiply', () => {
    const p = plan(comp('roof_covering'), [kv('construction_year', 1990)])
    expect(p.cost).toBeNull()
    expect(p.flags.map(flagText)).toContain('area missing; no cost')
  })

  it('takes the repaint interval of a known paint type', () => {
    const p = plan(
      comp('facade', {
        area: 100,
        last_painted_year: 2020,
        paint_type: 'slurry_paint',
      })
    )
    expect(p.repaint?.interval).toEqual({ low: 10, typical: 8, high: 6 })
    expect(p.repaint?.lastPainted.typical).toBe(2020)
    expect(p.repaint?.cost.typical).toBe(40000)
  })
})

describe('undocumented parts', () => {
  const lib: Library = {
    ...library,
    defaults: new Map([
      ...library.defaults,
      ['roof_covering', { assumeUndocumented: true }],
    ]),
  }

  it('assumes a part every house has from the construction year', () => {
    const plans = planComponents(
      [],
      [...house, kv('construction_year', 1990)],
      lib,
      START
    )
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({
      componentId: 'assumed:roof_covering',
      assumed: true,
      installYear: { typical: 1990 },
    })
  })

  it('does not assume what is documented or absent', () => {
    expect(
      planComponents(
        [comp('roof_covering', { area: 1 })],
        house,
        lib,
        START
      ).map((p) => p.assumed)
    ).toEqual([false])
    expect(
      planComponents(
        [],
        [...house, kv('absent_features', ['roof_covering'])],
        lib,
        START
      )
    ).toEqual([])
  })

  it('leaves an uninspected house’s findings unknown, not zero', () => {
    const rows = findingsByType([
      {
        inspected: true,
        workItems: [
          work({ componentId: 'r', costLowSek: 1000, costHighSek: 3000 }),
          work({}),
        ],
        typeOf: new Map([['r', 'roof_covering']]),
      },
      { inspected: false, workItems: [], typeOf: new Map() },
    ])
    expect(rows).toEqual([
      {
        type: 'roof_covering',
        perHouse: [{ items: 1, typicalSek: 2000, unpriced: 0 }, null],
      },
      {
        type: 'house',
        perHouse: [{ items: 1, typicalSek: 0, unpriced: 1 }, null],
      },
    ])
  })
})

describe('cheaper renewal', () => {
  const pipe = (values: Record<string, unknown> = {}, id?: string) =>
    comp(
      'sewer_pipes',
      { material: 'cast_iron', installation_year: 1967, ...values },
      id
    )

  it('relines in low and typical, replaces in high', () => {
    const p = plan(pipe())
    expect(p.renewal?.cost).toEqual({
      low: 50000,
      typical: 150000,
      high: 250000,
    })
    const typical = schedule(p, 'typical', START, START + 49)
    // Overdue: relined 2026, then every 30 years as a relined pipe.
    expect(typical.replacements).toEqual([
      { year: 2026, sek: 150000 },
      { year: 2056, sek: 150000 },
    ])
    const high = schedule(p, 'high', START, START + 14)
    expect(high.replacements).toEqual([{ year: 2026, sek: 220000 }])
  })

  it('does not reline what is relined or not cast iron', () => {
    expect(plan(pipe({ renovation_method: 'relined' })).renewal).toBeNull()
    expect(plan(pipe({ material: 'plastic' })).renewal).toBeNull()
  })

  it('relines a pipe of unknown material, as the filming decides', () => {
    const p = plan(comp('sewer_pipes', { installation_year: 1967 }))
    expect(p.renewal?.match).toEqual({ renovation_method: 'relined' })
  })

  it('films once before the first renewal of parts not inspected', () => {
    const plans = planComponents(
      [
        pipe({ installation_year: 2000 }, 'a'),
        pipe({ installation_year: 2005 }, 'b'),
        pipe({ installation_year: 1990, inspected_year: 2025 }, 'c'),
      ],
      house,
      library,
      START
    )
    expect(plans[2].inspection).toBeNull()
    const f = computeForecast({
      startYear: START,
      horizonYears: 15,
      plans,
      workItems: [],
      running: [],
      trend: null,
      capital: null,
    })
    const filming = f.items.filter((i) => i.category === 'inspection')
    // High renews a at 2000 + 30 = 2030; filmed the year before.
    expect(filming).toHaveLength(1)
    expect(filming[0].typical).toEqual([{ year: 2029, sek: 5500 }])
    expect(flagText(filming[0].flags[0])).toContain('2 part(s)')
  })

  it('counts the debt at the cost of the cheaper renewal', () => {
    const debt = maintenanceDebt([plan(pipe())], [], START)
    expect(debt.total).toEqual({
      low: 0.7375 * 50000,
      typical: 150000,
      high: 220000,
    })
  })
})

describe('schedule', () => {
  it('puts an overdue replacement in the start year, then repeats it', () => {
    const p = plan(
      comp('roof_covering', { installation_year: 1970, area: 100 })
    )
    const run = schedule(p, 'typical', START, START + 49)
    expect(run.overdueReplacement).toBe(true)
    expect(run.replacements.map((r) => r.year)).toEqual([2026, 2066])
  })

  it('repaints between replacements and restarts after one', () => {
    const p = plan(
      comp('facade', {
        installation_year: 1990,
        last_painted_year: 2020,
        area: 100,
      })
    )
    // Typical: replaced 1990 + 40 = 2030, painted 2020, every 10 years.
    const run = schedule(p, 'typical', START, START + 14)
    expect(run.replacements.map((r) => r.year)).toEqual([2030])
    expect(run.repaints.map((r) => r.year)).toEqual([2040])
  })

  it('replaces within two years in condition 1', () => {
    const p = plan(
      comp('roof_covering', { installation_year: 2020, condition: 1, area: 1 })
    )
    expect(schedule(p, 'typical', START, START + 14).replacements[0].year).toBe(
      2027
    )
    expect(schedule(p, 'high', START, START + 14).replacements[0].year).toBe(
      2026
    )
  })
})

const work = (w: Partial<WorkItemInput>): WorkItemInput => ({
  id: `w${n++}`,
  componentId: null,
  kind: 'REPAIR',
  description: 'x',
  yearMin: null,
  yearMax: null,
  costLowSek: null,
  costHighSek: null,
  ...w,
})

describe('computeForecast', () => {
  it('spreads work items, adds running costs and sums the scenarios', () => {
    const f = computeForecast({
      startYear: START,
      horizonYears: 3,
      plans: [],
      workItems: [
        work({
          yearMin: 2025,
          yearMax: 2027,
          costLowSek: 3000,
          costHighSek: 6000,
        }),
      ],
      running: [
        {
          key: 'water_sewage_cost_sek_per_year',
          base: { low: 1000, typical: 1000, high: 1000 },
          trend: 'WATER_SEWAGE',
          flags: [],
        },
      ],
      trend: { WATER_SEWAGE: 0.1 },
      capital: { interestRate: 0.04, loanSek: 100000 },
    })
    // 4 500 typical over 2025-2027: 2025 lands on 2026.
    expect(f.items[0].typical).toEqual([
      { year: 2026, sek: 3000 },
      { year: 2027, sek: 1500 },
    ])
    expect(f.items[1].typical.map((e) => Math.round(e.sek))).toEqual([
      1000, 1100, 1210,
    ])
    expect(f.items[2].total.typical).toBe(12000)
    expect(f.total.typical).toBeCloseTo(4500 + 3310 + 12000)
    expect(f.total.low).toBeCloseTo(3000 + 3310 + 12000)
    expect(f.perMonth.typical).toBeCloseTo(f.total.typical / 36)
  })

  it('lets a replacement work item time the component instead of counting twice', () => {
    const roof = comp(
      'roof_covering',
      { installation_year: 2020, area: 100 },
      'roof'
    )
    const plans = planComponents([roof], house, library, START)
    const items = [
      work({
        componentId: 'roof',
        kind: 'REPLACEMENT',
        yearMin: 2028,
        yearMax: 2028,
        costLowSek: 50000,
        costHighSek: 50000,
      }),
    ]
    const f = computeForecast({
      startYear: START,
      horizonYears: 5,
      plans,
      workItems: items,
      running: [],
      trend: null,
      capital: null,
    })
    expect(f.items).toHaveLength(1)
    expect(f.items[0].typical).toEqual([{ year: 2028, sek: 50000 }])
    expect(maintenanceDebt(plans, items, START).total.typical).toBe(50000)
  })
})

describe('maintenanceDebt', () => {
  it('counts the used-up share of each part and its paint', () => {
    const plans = planComponents(
      [
        comp('facade', {
          installation_year: 2006,
          last_painted_year: 2021,
          area: 100,
        }),
      ],
      house,
      library,
      START
    )
    const debt = maintenanceDebt(
      plans,
      [work({ costLowSek: 1000, costHighSek: 3000 })],
      START
    )
    // 20 of 40 years of 200 000, 5 of 10 years of 40 000, and the work item.
    expect(debt.parts.map((p) => p.sek.typical)).toEqual([100000, 20000, 2000])
    expect(debt.total.typical).toBe(122000)
  })

  it('explains a price difference per type and pools small parts', () => {
    const debt = (parts: [string, number][]) => ({
      total: {
        low: 0,
        typical: parts.reduce((t, [, s]) => t + s, 0),
        high: 0,
      },
      parts: parts.map(([type, sek]) => ({
        type,
        kind: 'replacement' as const,
        sek: { low: 0, typical: sek, high: 0 },
      })),
    })
    const r = explainDifference(
      {
        price: 3_000_000,
        debt: debt([
          ['roof_covering', 200_000],
          ['kitchen', 50_000],
        ]),
      },
      {
        price: 3_200_000,
        debt: debt([
          ['roof_covering', 20_000],
          ['kitchen', 60_000],
          ['sauna', 5_000],
        ]),
      }
    )
    expect(r.debtByType).toEqual([
      { type: 'roof_covering', sek: -180_000 },
      { type: 'other', sek: 15_000 },
    ])
    expect(r.adjustedPrice).toBe(200_000 - 165_000)
  })
})

describe('runningCosts', () => {
  const prices = { electricitySekPerKwh: 1.5, districtHeatingSekPerKwh: 0.8 }

  it('takes the listing’s parts and the rest of its total', () => {
    const r = runningCosts(
      [
        kv('operating_cost_sek_per_year', 40000),
        kv('heating_cost_sek_per_year', 15000),
        kv('property_fee_sek_per_year', 10000),
      ],
      [],
      prices,
      1.5
    )
    expect(r.lines.map((l) => [l.key, l.base.typical])).toEqual([
      ['heating_cost_sek_per_year', 15000],
      ['other_operating_cost', 25000],
      ['property_fee_sek_per_year', 10000],
    ])
  })

  it('prices energy use by the main heating', () => {
    const r = runningCosts(
      [kv('heating_kwh_per_year', 20000)],
      [comp('district_heating_substation')],
      prices,
      1.5
    )
    expect(r.lines[0].base.typical).toBe(16000)
    expect(r.lines[0].trend).toBe('DISTRICT_HEATING')
  })

  it('estimates from the primary energy number with Fgeo', () => {
    const r = runningCosts(
      [kv('energy_performance_kwh_per_m2', 90), kv('living_area', 120)],
      [comp('heat_pump_ground')],
      prices,
      1.5
    )
    // 90 × 120 × 1.5 / 1.8 = 9 000 kWh at 1.5 kr.
    expect(r.lines[0].base.typical).toBeCloseTo(13500)
    expect(r.lines[0].base.high).toBeCloseTo(13500 * 1.3)
  })

  it('says so when nothing is known', () => {
    expect(runningCosts([], [], prices, 1.5).flags.map(flagText)).toEqual([
      'heating cost unknown: no cost, energy use or energy class',
      'running costs unknown',
    ])
  })
})

describe('annualCost', () => {
  it('spreads each replacement and repaint over the years it lasts', () => {
    const a = annualCost(
      [
        plan(comp('roof_covering', { installation_year: 2000, area: 100 })),
        plan(comp('facade', { installation_year: 2000, area: 100 })),
      ],
      [],
      null
    )
    const roof = a.parts.find((p) => p.type === 'roof_covering')!
    // 100 m2 at 1 000–2 000 kr, lasting 50, 40 or 30 years.
    expect(roof.perYear.low).toBeCloseTo(100000 / 50)
    expect(roof.perYear.typical).toBeCloseTo(150000 / 40)
    expect(roof.perYear.high).toBeCloseTo(200000 / 30)
    const repaint = a.parts.find((p) => p.kind === 'repaint')!
    // 40 000 kr every 12, 10 or 8 years.
    expect(repaint.perYear).toEqual({
      low: 40000 / 12,
      typical: 4000,
      high: 5000,
    })
  })

  it('uses the cheaper renewal where the scenario does', () => {
    const a = annualCost(
      [
        plan(
          comp('sewer_pipes', {
            material: 'cast_iron',
            installation_year: 1967,
          })
        ),
      ],
      [],
      null
    )
    expect(a.parts[0].perYear.low).toBeCloseTo(50000 / 50)
    expect(a.parts[0].perYear.typical).toBeCloseTo(150000 / 30)
    expect(a.parts[0].perYear.high).toBeCloseTo(220000 / 30)
    expect(a.parts[0].renewedAs).toEqual({ renovation_method: 'relined' })
  })

  it('adds running costs and interest to the total per month', () => {
    const a = annualCost(
      [plan(comp('roof_covering', { installation_year: 2000, area: 100 }))],
      [
        {
          key: 'heating_cost_sek_per_year',
          base: { low: 10000, typical: 12000, high: 14000 },
          trend: null,
          flags: [],
        },
      ],
      { interestRate: 0.04, loanSek: 1000000 }
    )
    expect(a.running.typical).toBe(12000)
    expect(a.capital).toBe(40000)
    expect(a.total.typical).toBeCloseTo(3750 + 12000 + 40000)
    expect(a.perMonth.typical).toBeCloseTo((3750 + 12000 + 40000) / 12)
  })
})

describe('parts that depend on the rest of the house', () => {
  const lib: Library = {
    ...library,
    defaults: new Map([
      ...library.defaults,
      [
        'drainage',
        {
          assumeUndocumented: true,
          quantityPerLivingM2: 0.35,
          quantityFromFootprint: { basis: 'perimeter' as const, factor: 1 },
          context: { foundation_type: 'foundation' },
          assumeUnless: { foundation_type: ['plinth'] },
        },
      ],
      [
        'roof_covering',
        { quantityFromFootprint: { basis: 'area' as const, factor: 1.3 } },
      ],
      ['bathroom', { oneOfSeveral: true }],
    ]),
    profiles: [
      ...library.profiles,
      profile({ type: 'drainage', costUnit: 'LINEAR_M' }),
      profile({
        type: 'drainage',
        match: { foundation_type: 'basement' },
        costLowSek: 5000,
        costHighSek: 8000,
        costUnit: 'LINEAR_M',
      }),
      profile({ type: 'bathroom', costUnit: 'EACH' }),
    ],
  }
  const foundation = (foundation_type: string) =>
    comp('foundation', { foundation_type })
  const drainage = (components: ComponentView[], values = house) =>
    planComponents(components, values, lib, START).find(
      (p) => p.type === 'drainage'
    )

  it('prices drainage by the foundation type and says so', () => {
    const p = drainage([foundation('basement')])!
    expect(p.profile).toEqual({ foundation_type: 'basement' })
    expect(p.flags.map(flagText)).toContain(
      "priced for the house's foundation_type = basement"
    )
    expect(drainage([foundation('slab_on_ground')])!.profile).toEqual({})
  })

  it('does not assume drainage where the foundation rules it out', () => {
    expect(drainage([foundation('plinth')])).toBeUndefined()
    expect(drainage([])).toBeDefined()
  })

  it('takes quantities from the footprint when the floors are known', () => {
    // 120 m2 over 2 floors: a 60 m2 footprint, 4 × √60 m around it.
    const twoFloors = [...house, kv('floor_count', 2)]
    expect(drainage([], twoFloors)!.quantity).toBeCloseTo(4 * Math.sqrt(60))
    expect(drainage([], house)!.quantity).toBeCloseTo(0.35 * 120)
    const roof = planComponents(
      [comp('roof_covering', { installation_year: 2000 })],
      twoFloors,
      lib,
      START
    )[0]
    expect(roof.quantity).toBeCloseTo(1.3 * 60)
    expect(roof.flags.map(flagText)).toContain(
      'area estimated from living_area over 2 floor(s)'
    )
  })

  it('says when a house has several of a part', () => {
    const plans = planComponents(
      [comp('bathroom'), comp('bathroom')],
      house,
      lib,
      START
    ).filter((p) => p.type === 'bathroom')
    expect(plans).toHaveLength(2)
    expect(plans[0].flags.map(flagText)).toContain(
      'the house has 2 of these; while another one works, renewing this one is less urgent'
    )
    expect(
      planComponents([comp('bathroom')], house, lib, START)
        .find((p) => p.type === 'bathroom')!
        .flags.some((f) => f.code === 'one_of_several')
    ).toBe(false)
  })
})
