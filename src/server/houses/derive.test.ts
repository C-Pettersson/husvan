import { describe, expect, it } from 'vitest'
import {
  bathroomCount,
  featureAnswer,
  heating,
  pickPrice,
  risks,
} from './derive'
import type { ComponentView, KeyValueView } from './getHouse'

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
  children: ComponentView[] = []
): ComponentView => ({
  id: `c${n++}`,
  type,
  name: null,
  draft: false,
  values: Object.entries(values).map(([k, v]) => kv(k, v)),
  children,
})

describe('pickPrice', () => {
  it('prefers the final price, then the highest bid, then the asking price', () => {
    expect(
      pickPrice([kv('asking_price_sek', 3), kv('highest_bid_sek', 4)])
    ).toEqual({ sek: 4, kind: 'highest_bid_sek' })
    expect(
      pickPrice([kv('asking_price_sek', 3), kv('final_price_sek', 5)])
    ).toEqual({ sek: 5, kind: 'final_price_sek' })
    expect(pickPrice([])).toBeNull()
  })
})

describe('featureAnswer', () => {
  it('is yes when a component of the type exists, also nested', () => {
    const house = [comp('garage', {}, [comp('garage_door')])]
    expect(featureAnswer('garage', house, [])).toBe('yes')
    expect(featureAnswer('garage_door', house, [])).toBe('yes')
  })

  it('is no only when absent_features names it', () => {
    expect(featureAnswer('pool', [], [kv('absent_features', ['pool'])])).toBe(
      'no'
    )
    expect(featureAnswer('pool', [], [])).toBe('unknown')
  })

  it('derives the basement from the foundation type', () => {
    const basement = [comp('foundation', { foundation_type: 'basement' })]
    const slab = [comp('foundation', { foundation_type: 'slab_on_ground' })]
    expect(featureAnswer('basement', basement, [])).toBe('yes')
    expect(featureAnswer('basement', slab, [])).toBe('no')
    expect(featureAnswer('basement', [comp('foundation')], [])).toBe('unknown')
  })
})

describe('heating and bathrooms', () => {
  it('splits main heating from complements and counts bathrooms', () => {
    const house = [
      comp('district_heating_substation'),
      comp('heat_pump_air_air'),
      comp('bathroom', {}, [comp('underfloor_heating')]),
      comp('bathroom'),
    ]
    expect(heating(house)).toEqual({
      main: ['district_heating_substation'],
      complementary: ['heat_pump_air_air'],
    })
    expect(bathroomCount(house)).toBe(2)
  })
})

describe('risks', () => {
  it('flags risk foundations and older electrical systems', () => {
    const house = [
      comp('foundation', {
        foundation_type: 'slab_on_ground',
        slab_insulation: 'above',
      }),
      comp('electrical_installation', { wiring: 'two_wire' }, [
        comp('electrical_panel', { rcd: false }),
      ]),
    ]
    expect(risks(house).map((r) => [r.kind, r.type])).toEqual([
      ['risk_construction', 'foundation'],
      ['older_electrical', 'electrical_installation'],
      ['older_electrical', 'electrical_panel'],
    ])
  })

  it('leaves safe variants alone', () => {
    const house = [
      comp('foundation', {
        foundation_type: 'slab_on_ground',
        slab_insulation: 'below',
      }),
      comp('electrical_panel', { rcd: true }),
    ]
    expect(risks(house)).toEqual([])
  })
})
