import { describe, expect, it } from 'vitest'
import { componentTypes } from '../../../prisma/data/componentTypes.mts'
import { lifespanProfiles } from '../../../prisma/data/lifespanProfiles.mts'
import { selectProfile } from './profiles'
import {
  componentTypeSchema,
  lifespanProfileSchema,
  validateLibrary,
} from './schema'

describe('seeded type library', () => {
  it('has valid component types', () => {
    for (const t of componentTypes) {
      expect(() => componentTypeSchema.parse(t), t.type).not.toThrow()
    }
  })

  it('has valid lifespan profiles', () => {
    for (const p of lifespanProfiles) {
      const r = lifespanProfileSchema.safeParse(p)
      expect(
        r.success,
        `${p.type} ${JSON.stringify(p.match)}: ${r.error}`
      ).toBe(true)
    }
  })

  it('refers only to types and options that exist', () => {
    expect(validateLibrary(componentTypes, lifespanProfiles)).toEqual([])
  })

  it('covers every type CLAUDE.md lists', () => {
    const listed = [
      'foundation',
      'roof_covering',
      'facade',
      'window',
      'exterior_door',
      'drainage',
      'foundation_waterproofing',
      'heat_pump_air_water',
      'heat_pump_ground',
      'heat_pump_air_air',
      'district_heating_substation',
      'electric_boiler',
      'electric_radiators',
      'pellet_boiler',
      'wood_stove',
      'chimney',
      'ventilation_ftx',
      'ventilation_exhaust',
      'water_heater',
      'water_pipes',
      'sewer_pipes',
      'electrical_installation',
      'electrical_panel',
      'underfloor_heating',
      'kitchen',
      'bathroom',
      'garage_door',
      'pool',
      'sauna',
      'deck',
      'sunroom',
      'garage',
    ]
    const types = new Set(componentTypes.map((t) => t.type))
    expect(listed.filter((t) => !types.has(t))).toEqual([])
  })
})

describe('validateLibrary', () => {
  const roof = componentTypes.find((t) => t.type === 'roof_covering')!
  const profile = {
    type: 'roof_covering',
    lifespanMinYears: 30,
    lifespanTypicalYears: 40,
    lifespanMaxYears: 50,
    costLowSek: null,
    costHighSek: null,
    costUnit: 'M2' as const,
    priceYear: null,
    sources: [{ name: 'x', url: 'https://example.com' }],
  }

  it('rejects a profile matching an option that does not exist', () => {
    expect(
      validateLibrary([roof], [{ ...profile, match: { material: 'thatch' } }])
    ).toEqual([
      'roof_covering: profile matches material=thatch, not a choice option',
    ])
  })

  it('rejects a subcomponent type that does not exist', () => {
    expect(
      validateLibrary([{ ...roof, allowedSubcomponents: ['gutter'] }], [])
    ).toEqual(['roof_covering: unknown subcomponent gutter'])
  })

  it('requires a key order when profiles match on different keys', () => {
    expect(
      validateLibrary(
        [{ ...roof, forecastDefaults: {} }],
        [
          { ...profile, match: { material: 'sheet_metal' } },
          { ...profile, match: { sheet_profile: 'profiled' } },
        ]
      )
    ).toEqual([
      'roof_covering: profileKeyOrder lacks material',
      'roof_covering: profileKeyOrder lacks sheet_profile',
    ])
  })
})

describe('selectProfile', () => {
  const sewer = componentTypes.find((t) => t.type === 'sewer_pipes')!
  const profiles = lifespanProfiles.filter((p) => p.type === 'sewer_pipes')
  const select = (attributes: Record<string, string>) =>
    selectProfile(profiles, attributes, sewer.forecastDefaults?.profileKeyOrder)
      ?.match

  it('uses the default when nothing more specific fits', () => {
    expect(select({})).toEqual({})
    expect(select({ section: 'indoor' })).toEqual({})
  })

  it('prefers the earlier key in profileKeyOrder', () => {
    expect(
      select({ material: 'cast_iron', renovation_method: 'relined' })
    ).toEqual({ renovation_method: 'relined' })
  })

  it('prefers more matched keys after that', () => {
    expect(select({ material: 'plastic', section: 'ground' })).toEqual({
      section: 'ground',
      material: 'plastic',
    })
    expect(select({ material: 'plastic', section: 'indoor' })).toEqual({
      material: 'plastic',
    })
  })

  it('picks the more specific roof profile without an explicit tie', () => {
    const roofs = lifespanProfiles.filter((p) => p.type === 'roof_covering')
    expect(
      selectProfile(roofs, {
        material: 'sheet_metal',
        sheet_profile: 'standing_seam',
      })?.match
    ).toEqual({ material: 'sheet_metal', sheet_profile: 'standing_seam' })
    expect(selectProfile(roofs, { material: 'thatch' })).toBeUndefined()
  })
})
