import { describe, expect, it } from 'vitest'
import type { ComponentView, KeyValueView } from './getHouse'
import { newTypesSince, type TypeRow } from './libraryUpdates'

const day = (d: string) => new Date(`${d}T12:00:00Z`)

const type = (
  type: string,
  category: string,
  createdAt: string,
  extra: Partial<TypeRow> = {}
): TypeRow => ({
  type,
  label: { sv: type },
  category,
  attributeSchema: { installation_year: {}, condition: {} },
  forecastDefaults: {},
  createdAt: day(createdAt),
  ...extra,
})

const comp = (
  id: string,
  type: string,
  name: string | null = null
): ComponentView => ({
  id,
  type,
  name,
  draft: false,
  values: [],
  children: [],
})

const kv = (key: string, value: unknown): KeyValueView => ({
  key,
  current: {
    id: key,
    key,
    value: value as never,
    unit: null,
    source: 'CLAUDE',
    confidence: 1,
    quote: null,
    documentId: null,
    recordedAt: new Date(0),
    draft: false,
  },
  alternatives: [],
})

const library = [
  type('bathroom', 'interior', '2026-11-01'),
  type('roof_covering', 'envelope', '2026-11-01'),
  type('wc', 'interior', '2026-11-03'),
  type('roof_drainage', 'envelope', '2026-11-03', {
    forecastDefaults: { assumeUndocumented: true },
  }),
  type('carport', 'feature', '2026-11-03'),
  type('water_well', 'plumbing', '2026-11-04', { attributeSchema: null }),
]
const house = [
  comp('b1', 'bathroom', 'Badrum övervåning'),
  comp('r1', 'roof_covering'),
]

describe('newTypesSince', () => {
  it('lists the types added after the house was read, oldest first', () => {
    const updates = newTypesSince(
      library,
      day('2026-11-02'),
      house,
      [],
      new Set(['wc', 'roof_drainage'])
    )
    expect(updates.map((u) => u.type)).toEqual([
      'carport',
      'roof_drainage',
      'wc',
      'water_well',
    ])
  })

  it('says what the house has of the same kind and what the forecast assumes', () => {
    const byType = new Map(
      newTypesSince(library, day('2026-11-02'), house, [], new Set(['wc'])).map(
        (u) => [u.type, u]
      )
    )
    expect(byType.get('wc')).toMatchObject({
      hasProfile: true,
      assumedUndocumented: false,
      attributes: ['installation_year', 'condition'],
      related: [{ id: 'b1', type: 'bathroom', name: 'Badrum övervåning' }],
    })
    expect(byType.get('roof_drainage')).toMatchObject({
      hasProfile: false,
      assumedUndocumented: true,
      related: [{ id: 'r1', type: 'roof_covering', name: null }],
    })
    expect(byType.get('water_well')!.attributes).toEqual([])
  })

  it('leaves out types the house has or is known to lack', () => {
    const updates = newTypesSince(
      library,
      day('2026-11-02'),
      [...house, comp('c1', 'carport')],
      [kv('absent_features', ['wc'])],
      new Set()
    )
    expect(updates.map((u) => u.type)).toEqual(['roof_drainage', 'water_well'])
  })

  it('is empty when the house was read after the last addition', () => {
    expect(
      newTypesSince(library, day('2026-11-05'), house, [], new Set())
    ).toEqual([])
  })
})
