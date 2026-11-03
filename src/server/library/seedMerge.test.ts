import { describe, expect, it } from 'vitest'
import { differs, mergeType, pick, type StoredType } from './seedMerge'

const seed: StoredType = {
  label: { sv: 'Fasad', en: 'Facade' },
  category: 'envelope',
  attributeSchema: {
    material: { datatype: 'choice' },
    area: { datatype: 'number' },
  },
  allowedSubcomponents: ['window'],
  forecastDefaults: { assumeUndocumented: true, quantityPerLivingM2: 1 },
}
const existing: StoredType = {
  label: { sv: 'Fasaden' },
  category: 'envelope',
  attributeSchema: {
    material: { datatype: 'text' },
    colour: { datatype: 'text' },
  },
  allowedSubcomponents: ['door'],
  forecastDefaults: { quantityPerLivingM2: 1.2 },
}

describe('mergeType', () => {
  it('lets the repository win in full mode and keeps operation-time keys', () => {
    const m = mergeType(seed, existing, 'full')
    expect(m.label).toEqual(seed.label)
    expect(m.attributeSchema).toEqual({
      material: { datatype: 'choice' },
      area: { datatype: 'number' },
      colour: { datatype: 'text' },
    })
    expect(m.allowedSubcomponents).toEqual(['door', 'window'])
    expect(m.forecastDefaults).toEqual({
      assumeUndocumented: true,
      quantityPerLivingM2: 1,
    })
  })

  it('changes nothing stored in add-only mode and only adds what is missing', () => {
    const m = mergeType(seed, existing, 'add_only')
    expect(m.label).toEqual(existing.label)
    expect(m.attributeSchema).toEqual({
      material: { datatype: 'text' },
      colour: { datatype: 'text' },
      area: { datatype: 'number' },
    })
    expect(m.forecastDefaults).toEqual({
      assumeUndocumented: true,
      quantityPerLivingM2: 1.2,
    })
  })

  it('creates a missing type as the seed has it in both modes', () => {
    expect(mergeType(seed, null, 'add_only')).toBe(seed)
  })
})

describe('differs', () => {
  it('ignores key order, Decimal wrappers and null against absent', () => {
    expect(differs({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(false)
    expect(differs({ a: 1 }, { a: { toNumber: () => 1 } })).toBe(false)
    expect(differs({ a: 1 }, { a: 1, repaintMinYears: null })).toBe(false)
    expect(differs({ a: 1 }, { a: 2 })).toBe(true)
  })

  it('compares only the columns the seed defines', () => {
    const row = { id: 'x', type: 'wc', costLowSek: 1, extra: true }
    expect(pick(row, ['type', 'costLowSek', 'missing'])).toEqual({
      type: 'wc',
      costLowSek: 1,
    })
  })
})
