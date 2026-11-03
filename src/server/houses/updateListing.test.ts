import { describe, expect, it } from 'vitest'
import { listingRows, listingValues } from './updateListing'

describe('listingRows', () => {
  it('writes only what differs from the current value', () => {
    const { rows, unchanged } = listingRows(
      listingValues.parse({
        sale_status: 'bidding',
        asking_price_sek: 3_995_000,
        highest_bid_sek: 4_100_000,
      }),
      new Map<string, unknown>([
        ['sale_status', 'bidding'],
        ['asking_price_sek', 3_995_000],
        ['highest_bid_sek', 4_050_000],
      ])
    )
    expect(unchanged).toEqual(['sale_status', 'asking_price_sek'])
    expect(rows).toEqual([
      { key: 'highest_bid_sek', value: 4_100_000, confidence: 1 },
    ])
  })

  it('writes everything for a house without figures', () => {
    const { rows, unchanged } = listingRows(
      { final_price_sek: 4_200_000, sale_status: 'closed' },
      new Map()
    )
    expect(unchanged).toEqual([])
    expect(rows.map((r) => r.key)).toEqual(['final_price_sek', 'sale_status'])
  })

  it('refuses a sale status outside the house keys', () => {
    expect(listingValues.safeParse({ sale_status: 'sold' }).success).toBe(false)
    expect(listingValues.safeParse({ asking_price_sek: 0 }).success).toBe(false)
  })
})
