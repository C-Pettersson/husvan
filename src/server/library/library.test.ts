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

  it('repaints painted wood, with an interval for every paint type on facades', () => {
    const painted = lifespanProfiles
      .filter((p) => p.repaintTypicalYears)
      .map((p) => [p.type, p.match])
    expect(painted).toEqual([
      ['facade', { material: 'wood_panel' }],
      ['window', { frame_material: 'wood' }],
      ['exterior_door', { material: 'wood' }],
    ])
    const facade = componentTypes.find((t) => t.type === 'facade')!
    const paintType = facade.attributeSchema.paint_type
    expect(paintType.datatype).toBe('choice')
    expect(
      Object.keys(facade.forecastDefaults?.repaintByPaintType ?? {}).sort()
    ).toEqual(
      Object.keys(
        paintType.datatype === 'choice' ? paintType.options : {}
      ).sort()
    )
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

  it('takes repainting whole or not at all', () => {
    const repaint = {
      repaintMinYears: 8,
      repaintTypicalYears: 10,
      repaintMaxYears: 15,
      repaintCostLowSek: 200,
      repaintCostHighSek: 400,
    }
    const priced = { ...profile, priceYear: 2026 }
    expect(lifespanProfileSchema.safeParse(priced).success).toBe(true)
    expect(
      lifespanProfileSchema.safeParse({ ...priced, ...repaint }).success
    ).toBe(true)
    expect(
      lifespanProfileSchema.safeParse({ ...profile, ...repaint }).success
    ).toBe(false)
    expect(
      lifespanProfileSchema.safeParse({
        ...priced,
        ...repaint,
        repaintCostHighSek: null,
      }).success
    ).toBe(false)
    expect(
      lifespanProfileSchema.safeParse({
        ...priced,
        ...repaint,
        repaintMinYears: 20,
      }).success
    ).toBe(false)
  })

  it('rejects a repaint interval for a paint type that does not exist', () => {
    const facade = componentTypes.find((t) => t.type === 'facade')!
    const interval = {
      minYears: 8,
      typicalYears: 10,
      maxYears: 12,
      sources: [{ name: 'x', url: 'https://example.com' }],
    }
    expect(
      validateLibrary(
        [
          {
            ...facade,
            forecastDefaults: {
              repaintByPaintType: { acrylic: interval, tar: interval },
            },
          },
        ],
        []
      )
    ).toEqual(['facade: repaint interval for unknown paint_type tar'])
  })

  it('rejects a cheaper renewal on unknown options or without a profile', () => {
    const sewer = componentTypes.find((t) => t.type === 'sewer_pipes')!
    expect(
      validateLibrary(
        [
          {
            ...sewer,
            forecastDefaults: {
              cheaperRenewal: {
                when: { material: ['cast_iron', 'lead'] },
                match: { renovation_method: 'relined' },
              },
            },
          },
        ],
        []
      )
    ).toEqual([
      'sewer_pipes: cheaperRenewal names material=lead, not a choice option',
      'sewer_pipes: no profile matches cheaperRenewal',
    ])
  })

  it('checks context attributes and what rules an assumption out', () => {
    const foundation = {
      ...componentTypes.find((t) => t.type === 'foundation')!,
      allowedSubcomponents: [],
    }
    const drainage = componentTypes.find((t) => t.type === 'drainage')!
    expect(
      validateLibrary(
        [
          foundation,
          {
            ...drainage,
            forecastDefaults: {
              context: { foundation_type: 'foundation', roof: 'foundation' },
              assumeUnless: { foundation_type: ['igloo'], slab: ['x'] },
            },
          },
        ],
        [
          {
            ...profile,
            type: 'drainage',
            match: { foundation_type: 'basement' },
          },
        ]
      )
    ).toEqual([
      'drainage: context roof not an attribute of foundation',
      'drainage: assumeUnless names foundation_type=igloo, not a choice option',
      'drainage: assumeUnless slab is not context',
    ])
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
