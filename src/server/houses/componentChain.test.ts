import { describe, expect, it } from 'vitest'
import { resolveChains, type ChainRow } from './componentChain'

const row = (
  id: string,
  parentId: string | null = null,
  extra: Partial<ChainRow> = {}
): ChainRow => ({ id, parentId, replacesId: null, correctsId: null, ...extra })

describe('resolveChains', () => {
  it('lets a correction stand for the row it corrects', () => {
    const bath = row('bath')
    const wc = row('wc', null, { correctsId: 'bath' })
    const floor = row('floor', 'bath')
    const { heads, headOf, chainOf } = resolveChains([bath, wc, floor])
    expect(heads.map((h) => h.id)).toEqual(['wc', 'floor'])
    // The old row's values and children belong to the new row.
    expect(headOf.get('bath')).toBe('wc')
    expect(headOf.get(floor.parentId!)).toBe('wc')
    expect(chainOf.get('wc')!.map((r) => r.id)).toEqual(['wc', 'bath'])
  })

  it('follows a chain of corrections and hides a replaced chain', () => {
    const a = row('a')
    const b = row('b', null, { correctsId: 'a' })
    const c = row('c', null, { correctsId: 'b' })
    expect(
      resolveChains([a, b, c])
        .chainOf.get('c')!
        .map((r) => r.id)
    ).toEqual(['c', 'b', 'a'])
    // Replacing any row of the chain retires the whole part.
    const d = row('d', null, { replacesId: 'a' })
    const { heads, headOf } = resolveChains([a, b, c, d])
    expect(heads.map((h) => h.id)).toEqual(['d'])
    expect(headOf.has('c')).toBe(false)
  })

  it('moves a part by correcting its parent', () => {
    const house = row('garage')
    const roof = row('roof')
    const moved = row('roof2', 'garage', { correctsId: 'roof' })
    const { heads } = resolveChains([house, roof, moved])
    expect(heads.map((h) => [h.id, h.parentId])).toEqual([
      ['garage', null],
      ['roof2', 'garage'],
    ])
  })

  it('keeps a correction whose target it cannot see as a plain row', () => {
    const { heads, chainOf } = resolveChains([
      row('fix', null, { correctsId: 'gone' }),
    ])
    expect(heads.map((h) => h.id)).toEqual(['fix'])
    expect(chainOf.get('fix')!.map((r) => r.id)).toEqual(['fix'])
  })
})
