import { describe, expect, it, vi } from 'vitest'
import {
  QUOTAS,
  documentQuotaProblem,
  fileQuotaProblem,
  houseQuotaProblem,
  mayKeepForecast,
  observationQuotaProblem,
} from './quota'

function fake({
  role = 'USER',
  houses = 0,
  documents = 0,
  chars = 0,
  bytes = 0 as number | null,
  observations = 0,
  forecasts = 0,
} = {}) {
  return {
    user: { findUnique: vi.fn(async () => ({ role })) },
    house: { count: vi.fn(async () => houses) },
    document: {
      count: vi.fn(async () => documents),
      aggregate: vi.fn(async () => ({ _sum: { sizeBytes: bytes } })),
    },
    observation: { count: vi.fn(async () => observations) },
    forecast: { count: vi.fn(async () => forecasts) },
    $queryRaw: vi.fn(async () => [{ chars: BigInt(chars) }]),
  } as never
}

describe('quotas', () => {
  it('refuses a house past the limit, with a reason for Claude', async () => {
    expect(
      await houseQuotaProblem(fake({ houses: QUOTAS.houses - 1 }), 'u')
    ).toBeNull()
    expect(
      await houseQuotaProblem(fake({ houses: QUOTAS.houses }), 'u')
    ).toMatch(/at most 20 houses/)
  })

  it('refuses a document past the count or the text limit', async () => {
    const atCount = fake({ documents: QUOTAS.documents })
    expect(
      await documentQuotaProblem(atCount, 'u', { isNew: true, addedChars: 0 })
    ).toMatch(/documents/)
    // Filling in an existing document adds no document.
    expect(
      await documentQuotaProblem(atCount, 'u', { isNew: false, addedChars: 0 })
    ).toBeNull()
    const nearlyFull = fake({ chars: QUOTAS.documentChars - 10 })
    expect(
      await documentQuotaProblem(nearlyFull, 'u', {
        isNew: false,
        addedChars: 10,
      })
    ).toBeNull()
    expect(
      await documentQuotaProblem(nearlyFull, 'u', {
        isNew: false,
        addedChars: 11,
      })
    ).toMatch(/characters/)
  })

  it('counts the file being added against stored bytes', async () => {
    const nearlyFull = fake({ bytes: QUOTAS.fileBytes - 100 })
    expect(
      await fileQuotaProblem(nearlyFull, 'u', { addedBytes: 100 })
    ).toBeNull()
    expect(
      await fileQuotaProblem(nearlyFull, 'u', { addedBytes: 101 })
    ).toMatch(/1 GB/)
  })

  it('treats an account with no sized files as empty', async () => {
    expect(
      await fileQuotaProblem(fake({ bytes: null }), 'u', { addedBytes: 1 })
    ).toBeNull()
  })

  it('refuses values past the limit and stops keeping forecasts', async () => {
    expect(
      await observationQuotaProblem(
        fake({ observations: QUOTAS.observations }),
        'u'
      )
    ).toMatch(/stored values/)
    expect(
      await mayKeepForecast(
        fake({ forecasts: QUOTAS.forecastsPerHouse }),
        'u',
        'h'
      )
    ).toBe(false)
  })

  it('does not limit an administrator', async () => {
    const admin = fake({
      role: 'ADMIN',
      houses: 999,
      documents: 9999,
      chars: QUOTAS.documentChars,
      bytes: QUOTAS.fileBytes,
      observations: QUOTAS.observations,
      forecasts: 999,
    })
    expect(await houseQuotaProblem(admin, 'u')).toBeNull()
    expect(
      await documentQuotaProblem(admin, 'u', { isNew: true, addedChars: 9 })
    ).toBeNull()
    expect(await fileQuotaProblem(admin, 'u', { addedBytes: 9 })).toBeNull()
    expect(await observationQuotaProblem(admin, 'u')).toBeNull()
    expect(await mayKeepForecast(admin, 'u', 'h')).toBe(true)
  })
})
