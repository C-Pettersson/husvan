import { describe, expect, it } from 'vitest'
import { toRows } from './scb.mts'

describe('toRows', () => {
  it('maps the flat value array to codes, last dimension fastest', () => {
    const rows = toRows({
      id: ['Region', 'Tid'],
      size: [2, 3],
      dimension: {
        Region: { category: { index: { '2580': 0, '2582': 1 } } },
        Tid: { category: { index: { '2023': 0, '2024': 1, '2025': 2 } } },
      },
      value: [1, 2, 3, 4, null, 6],
    })
    expect(rows).toEqual([
      { Region: '2580', Tid: '2023', value: 1 },
      { Region: '2580', Tid: '2024', value: 2 },
      { Region: '2580', Tid: '2025', value: 3 },
      { Region: '2582', Tid: '2023', value: 4 },
      { Region: '2582', Tid: '2024', value: null },
      { Region: '2582', Tid: '2025', value: 6 },
    ])
  })
})
