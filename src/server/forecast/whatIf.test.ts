import { describe, expect, it } from 'vitest'
import type { ComponentView, KeyValueView } from '@/server/houses/getHouse'
import { applyWhatIf } from './whatIf'

const kv = (key: string, value: unknown): KeyValueView => ({
  key,
  current: {
    id: key,
    key,
    value: value as never,
    unit: null,
    source: 'CLAUDE',
    confidence: 0.8,
    quote: null,
    documentId: null,
    recordedAt: new Date(0),
    draft: false,
  },
  alternatives: [],
})
const comp = (
  id: string,
  type: string,
  values: KeyValueView[] = [],
  children: ComponentView[] = []
): ComponentView => ({ id, type, name: null, draft: false, values, children })

const house = [kv('construction_year', 1975), kv('living_area', 120)]
const components = [
  comp('facade', 'facade', [kv('installation_year', 1975)]),
  comp('bathroom', 'bathroom'),
  comp('ftx', 'ventilation_ftx', [], [comp('battery', 'heating_battery')]),
]

describe('applyWhatIf', () => {
  it('does nothing without a scenario', () => {
    const r = applyWhatIf(components, house, undefined)
    expect(r.components).toBe(components)
    expect(r.problems).toEqual([])
  })

  it('sets values on the house and on a part as the user’s own', () => {
    const r = applyWhatIf(components, house, {
      values: [
        { key: 'living_area', value: 130 },
        { componentId: 'facade', key: 'installation_year', value: 2013 },
      ],
    })
    const area = r.houseValues.find((v) => v.key === 'living_area')!.current
    expect(area).toMatchObject({ value: 130, source: 'USER', confidence: 1 })
    expect(
      r.components[0].values.find((v) => v.key === 'installation_year')!.current
        .value
    ).toBe(2013)
    expect(r.components[0].values).toHaveLength(1)
    // The stored house is untouched.
    expect(components[0].values[0].current.value).toBe(1975)
  })

  it('tries a part the documents do not mention with only that value', () => {
    const r = applyWhatIf(components, house, {
      values: [
        {
          componentId: 'assumed:drainage',
          key: 'installation_year',
          value: 2010,
        },
        { componentId: 'assumed:drainage', key: 'condition', value: 4 },
      ],
    })
    const added = r.components.find((c) => c.id === 'assumed:drainage')!
    expect(added.type).toBe('drainage')
    expect(added.values.map((v) => v.key)).toEqual([
      'installation_year',
      'condition',
    ])
  })

  it('leaves parts out with their subcomponents', () => {
    const r = applyWhatIf(components, house, {
      excludeComponentIds: ['bathroom', 'ftx'],
    })
    expect(r.components.map((c) => c.id)).toEqual(['facade'])
  })

  it('applies nothing when an id is not in the house', () => {
    const r = applyWhatIf(components, house, {
      values: [{ componentId: 'battery', key: 'condition', value: 3 }],
      excludeComponentIds: ['ftx', 'garage'],
    })
    expect(r.problems).toEqual([
      'No component garage in the house.',
      'No component battery in the house.',
    ])
    expect(r.components).toBe(components)
    expect(r.houseValues).toBe(house)
  })
})
