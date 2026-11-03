import { describe, expect, it } from 'vitest'
import { currentValues, type Candidate } from './currentValue'

const at = (day: number) => new Date(Date.UTC(2026, 9, day))
const obs = (
  id: string,
  source: Candidate['source'],
  confidence: number | null,
  day: number,
  key = 'installation_year'
) => ({ id, key, source, confidence, recordedAt: at(day) })

const pick = (list: ReturnType<typeof obs>[]) =>
  currentValues(list).get('installation_year')!

describe('currentValues', () => {
  it('prefers the user over Claude over an import', () => {
    const v = pick([
      obs('import', 'IMPORT', 1, 3),
      obs('claude', 'CLAUDE', 0.9, 2),
      obs('user', 'USER', 0.1, 1),
    ])
    expect(v.current.id).toBe('user')
    expect(v.alternatives.map((o) => o.id)).toEqual(['claude', 'import'])
  })

  it('then prefers the higher confidence, a missing one last', () => {
    const v = pick([
      obs('none', 'CLAUDE', null, 3),
      obs('low', 'CLAUDE', 0.5, 2),
      obs('high', 'CLAUDE', 0.9, 1),
    ])
    expect(v.current.id).toBe('high')
    expect(v.alternatives.map((o) => o.id)).toEqual(['low', 'none'])
  })

  it('then prefers the latest', () => {
    expect(
      pick([obs('old', 'CLAUDE', 0.9, 1), obs('new', 'CLAUDE', 0.9, 2)]).current
        .id
    ).toBe('new')
  })

  it('lets the latest win for sale figures, whatever the source', () => {
    const v = currentValues([
      obs('claude', 'CLAUDE', 0.9, 1, 'highest_bid_sek'),
      obs('user', 'USER', 1, 2, 'highest_bid_sek'),
      obs('import', 'IMPORT', 1, 3, 'highest_bid_sek'),
    ]).get('highest_bid_sek')!
    expect(v.current.id).toBe('import')
    expect(v.alternatives.map((o) => o.id)).toEqual(['user', 'claude'])
    // Two on the same day fall back on the source.
    expect(
      currentValues([
        obs('import', 'IMPORT', 1, 3, 'sale_status'),
        obs('user', 'USER', 1, 3, 'sale_status'),
      ]).get('sale_status')!.current.id
    ).toBe('user')
  })

  it('keeps keys apart', () => {
    const values = currentValues([
      obs('a', 'CLAUDE', 0.9, 1, 'area'),
      obs('b', 'CLAUDE', 0.9, 1),
    ])
    expect([...values.keys()]).toEqual(['area', 'installation_year'])
    expect(values.get('area')!.alternatives).toEqual([])
  })
})
