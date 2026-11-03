import { describe, expect, it } from 'vitest'
import type { KeyValueView } from '@/server/houses/getHouse'
import { perLivingM2 } from './compare'

const kv = (key: string, value: unknown): KeyValueView => ({
  key,
  current: {
    id: key,
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

const range = (typical: number) => ({
  low: typical / 2,
  typical,
  high: typical * 2,
})

const analysis = (values: KeyValueView[]) =>
  ({
    view: { values },
    price: { sek: 3_000_000, kind: 'asking_price_sek' },
    adjustedPrice: range(3_300_000),
    forecast: { total: range(1_320_000), perMonth: range(7_333) },
    annual: { perMonth: range(6_600) },
  }) as unknown as Parameters<typeof perLivingM2>[0]

describe('perLivingM2', () => {
  it('divides price, adjusted price and the forecast by the living area', () => {
    const r = perLivingM2(analysis([kv('living_area', 132)]))
    expect(r.livingAreaM2).toBe(132)
    expect(r.price).toBeCloseTo(22_727.27, 2)
    expect(r.maintenanceAdjustedPrice).toEqual({
      low: 1_650_000 / 132,
      typical: 25_000,
      high: 50_000,
    })
    expect(r.forecastTotal?.typical).toBe(10_000)
    expect(r.forecastPerMonth?.typical).toBeCloseTo(55.55, 2)
    expect(r.annualPerMonth?.typical).toBe(50)
  })

  it('is null without a living area, or with an unusable one', () => {
    for (const values of [
      [],
      [kv('living_area', 0)],
      [kv('living_area', '132')],
    ])
      expect(perLivingM2(analysis(values))).toEqual({
        livingAreaM2: null,
        price: null,
        maintenanceAdjustedPrice: null,
        forecastTotal: null,
        forecastPerMonth: null,
        annualPerMonth: null,
      })
  })

  it('leaves the price null when there is none', () => {
    const a = analysis([kv('living_area', 121)])
    const r = perLivingM2({ ...a, price: null, adjustedPrice: null })
    expect(r.price).toBeNull()
    expect(r.maintenanceAdjustedPrice).toBeNull()
    expect(r.forecastTotal?.typical).toBeCloseTo(10_909.09, 2)
  })
})
