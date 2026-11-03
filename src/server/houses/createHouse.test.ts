import { describe, expect, it } from 'vitest'
import { isSameHouse } from './createHouse'
import { externalIdsOf, matchesExternalId } from './externalId'

describe('isSameHouse', () => {
  const existing = {
    address: 'Yxgränd 6, 973 42 Luleå',
    municipalityCode: '2580',
    propertyDesignation: 'Luleå Notviken 7:12',
    externalIds: ['4711', 'HN-2024-0099'],
  }

  it('recognises the same external id, however it is written', () => {
    const other = {
      address: 'Okänd adress',
      municipalityCode: '2582',
      externalIds: [' 4711 '],
    }
    expect(isSameHouse(existing, other)).toBe(true)
    expect(
      isSameHouse(existing, { ...other, externalIds: ['hn-2024-0099'] })
    ).toBe(true)
  })

  it('does not match a different external id', () => {
    expect(
      isSameHouse(existing, {
        address: 'Björkvägen 1',
        municipalityCode: '2580',
        externalIds: ['4712'],
      })
    ).toBe(false)
  })

  it('still matches on designation and street without ids', () => {
    expect(
      isSameHouse(existing, {
        address: 'x',
        propertyDesignation: 'luleå notviken 7:12',
      })
    ).toBe(true)
    expect(isSameHouse(existing, { address: 'yxgränd 6' })).toBe(true)
    expect(
      isSameHouse(existing, { address: 'Yxgränd 6', municipalityCode: '2582' })
    ).toBe(false)
  })
})

describe('external id filter', () => {
  it('matches booli_id or listing_id, trimmed and case-insensitive', () => {
    const ids = externalIdsOf([
      { key: 'booli_id', value: 4711 },
      { key: 'listing_id', value: 'HN-1 ' },
      { key: 'living_area', value: 132 },
      { key: 'booli_id', value: '' },
    ])
    expect(ids).toEqual(['4711', 'HN-1 '])
    expect(matchesExternalId(ids, '4711')).toBe(true)
    expect(matchesExternalId(ids, 'hn-1')).toBe(true)
    expect(matchesExternalId(ids, '471')).toBe(false)
    expect(matchesExternalId([], '4711')).toBe(false)
  })
})
