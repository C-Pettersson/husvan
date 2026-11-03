import { describe, expect, it } from 'vitest'
import {
  checkValue,
  normalizeValue,
  parseApproximateYear,
  type References,
} from './checkValue'

const refs: References = { documents: new Set(), components: new Set() }
const year = { datatype: 'year' as const }
const now = new Date('2026-11-03T00:00:00Z')

describe('approximate years', () => {
  it('parses a span, a bound and an object', () => {
    expect(parseApproximateYear('1999-2004')).toMatchObject({
      from: 1999,
      to: 2004,
    })
    expect(parseApproximateYear('1999–2004')).toMatchObject({
      from: 1999,
      to: 2004,
    })
    expect(parseApproximateYear('1999 till 2004')).toMatchObject({
      from: 1999,
      to: 2004,
    })
    expect(parseApproximateYear('before 2006')).toMatchObject({
      from: 1986,
      to: 2006,
    })
    expect(parseApproximateYear('före 2006')).toMatchObject({
      from: 1986,
      to: 2006,
    })
    expect(parseApproximateYear({ from: 1999, to: 2004 })).toMatchObject({
      from: 1999,
      to: 2004,
    })
    expect(parseApproximateYear('2001')).toBeNull()
    expect(parseApproximateYear(2001)).toBeNull()
    expect(parseApproximateYear('about 2001')).toBeNull()
  })

  it('passes validation as a year, in the right order', () => {
    expect(checkValue(year, '1999-2004', undefined, refs, now)).toBeNull()
    expect(
      checkValue(year, { from: 1999, to: 2004 }, undefined, refs, now)
    ).toBeNull()
    expect(checkValue(year, '2004-1999', undefined, refs, now)).toMatch(
      /earlier year/
    )
    expect(checkValue(year, '1500-1600', undefined, refs, now)).toMatch(
      /between 1600/
    )
    expect(checkValue(year, 'about 2001', undefined, refs, now)).toMatch(
      /whole year/
    )
    expect(checkValue(year, 2001, undefined, refs, now)).toBeNull()
  })

  it('is stored as the middle year with a capped confidence and the original as quote', () => {
    expect(
      normalizeValue(year, { value: '1999-2004', confidence: 0.9 })
    ).toEqual({ value: 2002, confidence: 0.7, quote: '1999-2004' })
    expect(
      normalizeValue(year, {
        value: '1999-2004',
        confidence: 0.5,
        quote: 'byttes kring millennieskiftet',
      })
    ).toEqual({
      value: 2002,
      confidence: 0.5,
      quote: 'byttes kring millennieskiftet',
    })
    expect(normalizeValue(year, { value: 2001, confidence: 0.9 })).toBeNull()
    expect(
      normalizeValue(
        { datatype: 'text' },
        { value: '1999-2004', confidence: 0.9 }
      )
    ).toBeNull()
  })
})
