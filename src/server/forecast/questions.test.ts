import { describe, expect, it } from 'vitest'
import type { ComponentView, KeyValueView } from '@/server/houses/getHouse'
import type { AttributeDefinition } from '@/server/library/schema'
import type { WorkItemInput } from './forecast'
import type { Library, ProfileRow } from './plan'
import { openQuestions, type QuestionInput } from './questions'

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
  values: KeyValueView[] = [],
  id = `c${n++}`
): ComponentView => ({
  id,
  type,
  name: null,
  draft: false,
  values,
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

const label = { sv: 'x' }
const choice = (...options: string[]): AttributeDefinition => ({
  label,
  datatype: 'choice',
  options: Object.fromEntries(options.map((o) => [o, label])),
})

const library: Library = {
  defaults: new Map([
    ['roof_covering', { profileKeyOrder: ['material'] }],
    [
      'drainage',
      {
        assumeUndocumented: true,
        context: { foundation_type: 'foundation' },
        assumeUnless: { foundation_type: ['plinth'] },
        profileKeyOrder: ['foundation_type'],
      },
    ],
    ['foundation', {}],
  ]),
  profiles: [
    profile({}),
    profile({
      match: { material: 'sheet_metal' },
      lifespanMinYears: 40,
      lifespanTypicalYears: 50,
      lifespanMaxYears: 60,
    }),
    profile({
      type: 'drainage',
      costUnit: 'HOUSE',
      costLowSek: 100000,
      costHighSek: 100000,
    }),
    profile({
      type: 'drainage',
      match: { foundation_type: 'basement' },
      costUnit: 'HOUSE',
      costLowSek: 200000,
      costHighSek: 200000,
    }),
  ],
  indexFactor: () => 1,
}

const attributes = new Map<string, Record<string, AttributeDefinition>>([
  [
    'roof_covering',
    {
      material: choice('concrete_tile', 'sheet_metal'),
      colour: choice('red', 'black'),
    },
  ],
  [
    'foundation',
    {
      foundation_type: choice('slab_on_ground', 'basement', 'plinth'),
      slab_insulation: choice('below', 'above'),
    },
  ],
])

const START = 2026
const house = [
  kv('construction_year', 1990),
  kv('living_area', 120),
  kv('floor_count', 1),
  kv('radon_bq_m3', 50),
  kv('operating_cost_sek_per_year', 40000),
]

const input = (
  components: ComponentView[],
  houseValues = house,
  workItems: WorkItemInput[] = []
): QuestionInput => ({
  components,
  houseValues,
  library,
  attributes,
  forecast: {
    startYear: START,
    horizonYears: 15,
    workItems,
    running: [],
    trend: null,
    capital: null,
  },
})

const roof = (values: KeyValueView[] = []) =>
  comp(
    'roof_covering',
    [kv('area', 100), kv('material', 'concrete_tile'), ...values],
    'roof'
  )
const foundation = comp('foundation', [
  kv('foundation_type', 'slab_on_ground'),
  kv('slab_insulation', 'below'),
])

const find = (
  r: ReturnType<typeof openQuestions>,
  id: string | null,
  key: string
) => r.questions.find((q) => q.componentId === id && q.key === key)

describe('openQuestions', () => {
  it('tries the age of a part without an installation year', () => {
    const r = openQuestions(input([roof(), foundation]))
    const q = find(r, 'roof', 'installation_year')!
    expect(q.why).toBe('missing')
    expect(q.usedNow).toBe(1990)
    expect(q.answers.map((a) => a.value)).toEqual([1990, 2006, 2026])
    // The whole house's debt: the roof is 150 000 kr typical, 36 of 40
    // years used from 1990 and none when renewed now.
    expect(
      q.answers[0].maintenanceDebtSek - q.answers[2].maintenanceDebtSek
    ).toBeCloseTo(135000)
    expect(q.answers[0].maintenanceDebtSek).toBeCloseTo(
      r.now.maintenanceDebtSek
    )
    expect(q.swing!.maintenanceDebtSek).toBeCloseTo(135000)
  })

  it('asks nothing about a value that is known and certain', () => {
    const r = openQuestions(
      input([
        roof([kv('installation_year', 2020), kv('condition', 4)]),
        foundation,
      ])
    )
    expect(find(r, 'roof', 'installation_year')).toBeUndefined()
    expect(find(r, 'roof', 'condition')).toBeUndefined()
    // A choice that changes no total is left out.
    expect(find(r, 'roof', 'colour')).toBeUndefined()
  })

  it('asks again about an uncertain value and says what it is', () => {
    const r = openQuestions(
      input([roof([kv('installation_year', 2020, 0.4)]), foundation])
    )
    const q = find(r, 'roof', 'installation_year')!
    expect(q.why).toBe('uncertain')
    expect(q.now).toEqual({ value: 2020, confidence: 0.4 })
    expect(q.usedNow).toBeUndefined()
  })

  it('tries every option of a choice the profile depends on', () => {
    const r = openQuestions(
      input([
        comp(
          'roof_covering',
          [kv('area', 100), kv('installation_year', 2000)],
          'roof'
        ),
        foundation,
      ])
    )
    const q = find(r, 'roof', 'material')!
    expect(q.answers.map((a) => a.value)).toEqual([
      'concrete_tile',
      'sheet_metal',
    ])
    // 26 of 40 years against 26 of 50.
    expect(q.swing!.maintenanceDebtSek).toBeCloseTo(
      150000 * (26 / 40 - 26 / 50)
    )
  })

  it('asks about an undocumented foundation through the parts that read it', () => {
    const r = openQuestions(input([roof([kv('installation_year', 2020)])]))
    const q = find(r, 'assumed:foundation', 'foundation_type')!
    expect(q.documented).toBe(false)
    expect(q.decides).toBe('risk_construction')
    // Drainage from 1990 is 36 of 40 years used: 180 000 kr at a basement,
    // 90 000 kr otherwise, nothing on a plinth where it is not assumed.
    const debt = Object.fromEntries(
      q.answers.map((a) => [a.value, a.maintenanceDebtSek])
    )
    expect(debt.plinth).toBeCloseTo(debt.slab_on_ground - 90000)
    expect(debt.basement).toBeCloseTo(debt.slab_on_ground + 90000)
  })

  it('keeps a question that decides a risk even when it costs nothing', () => {
    const r = openQuestions(
      input([
        roof([kv('installation_year', 2020)]),
        comp('foundation', [kv('foundation_type', 'slab_on_ground')]),
      ])
    )
    const q = find(
      r,
      r.questions.find((x) => x.key === 'slab_insulation')!.componentId,
      'slab_insulation'
    )!
    expect(q.decides).toBe('risk_construction')
    expect(q.swing!.maintenanceDebtSek).toBe(0)
  })

  it('asks for a quantity only when the part has none to be costed by', () => {
    const r = openQuestions(
      input([
        comp('roof_covering', [kv('installation_year', 2000)], 'roof'),
        foundation,
      ])
    )
    expect(find(r, 'roof', 'area')).toMatchObject({
      why: 'missing',
      swing: null,
    })
  })

  it('lists what it cannot try, after the ones it can', () => {
    const r = openQuestions(
      input(
        [roof(), foundation],
        house.filter(
          (v) => !['radon_bq_m3', 'operating_cost_sek_per_year'].includes(v.key)
        ),
        [
          {
            id: 'w1',
            componentId: 'roof',
            kind: 'REPAIR',
            description: 'Byt trasiga takpannor',
            yearMin: null,
            yearMax: null,
            costLowSek: null,
            costHighSek: null,
          },
        ]
      )
    )
    expect(find(r, null, 'radon_bq_m3')).toMatchObject({
      decides: 'radon',
      swing: null,
    })
    expect(find(r, null, 'operating_cost_sek_per_year')?.swing).toBeNull()
    expect(find(r, 'roof', 'cost')).toMatchObject({
      why: 'no_cost',
      workItemId: 'w1',
    })
    const weights = r.questions.map((q) =>
      q.swing ? Math.max(q.swing.maintenanceDebtSek, q.swing.forecastSek) : -1
    )
    expect(weights).toEqual([...weights].sort((a, b) => b - a))
    expect(r.questions[0].key).toBe('installation_year')
  })
})

describe('the form of a question', () => {
  const r = openQuestions(
    input(
      [roof(), comp('foundation', [kv('foundation_type', 'slab_on_ground')])],
      house.filter((v) => v.key !== 'radon_bq_m3'),
      [
        {
          id: 'w1',
          componentId: 'roof',
          kind: 'REPAIR',
          description: 'Byt trasiga takpannor',
          yearMin: null,
          yearMax: null,
          costLowSek: null,
          costHighSek: null,
        },
      ]
    )
  )

  it('offers the original part and spans of years after it, and any year', () => {
    const q = find(r, 'roof', 'installation_year')!
    expect(q.id).toBe('roof:installation_year')
    expect(q.how).toBe('ask')
    expect(q.options.map((o) => [o.value, o.meaning])).toEqual([
      [1990, { kind: 'original', year: 1990 }],
      [2023, { kind: 'years_ago', from: 0, to: 5 }],
      [2016, { kind: 'years_ago', from: 5, to: 15 }],
      [2003, { kind: 'years_ago', from: 15, to: 30 }],
    ])
    // Approximate, but enough to settle the question.
    expect(q.options.every((o) => o.confidence === 0.7)).toBe(true)
    expect(q.manual).toEqual({ datatype: 'year', min: 1800, max: 2026 })
  })

  it('offers every grade of condition, and nothing to type', () => {
    const q = find(r, 'roof', 'condition')!
    expect(q.how).toBe('look')
    expect(q.options.map((o) => o.value)).toEqual([5, 4, 3, 2, 1])
    expect(q.manual).toBeNull()
  })

  it('offers a choice by the type’s own options', () => {
    const q = find(
      r,
      r.questions.find((x) => x.key === 'slab_insulation')!.componentId,
      'slab_insulation'
    )!
    expect(q.options.map((o) => o.value)).toEqual(['below', 'above'])
    expect(q.options[0].meaning).toEqual({ kind: 'choice' })
  })

  it('stores radon not measured under its own key', () => {
    const q = find(r, null, 'radon_bq_m3')!
    expect(q.options).toMatchObject([{ value: false, key: 'radon_measured' }])
    expect(q.manual).toMatchObject({ datatype: 'number', unit: 'Bq/m3' })
  })

  it('asks for a work item’s cost in kronor', () => {
    const q = r.questions.find((x) => x.workItemId === 'w1')!
    expect(q.id).toBe('work_item:w1')
    expect(q.manual).toMatchObject({ datatype: 'number', unit: 'SEK' })
  })
})
