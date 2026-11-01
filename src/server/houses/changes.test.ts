import { describe, expect, it } from 'vitest'
import { checkValue, isIsoDate } from '@/server/library/checkValue'
import {
  changesInput,
  validateChanges,
  type ChangeContext,
  type LibraryType,
} from './changes'

const refs = { documents: new Set<string>(), components: new Set<string>() }

describe('checkValue', () => {
  it('checks numbers against range and unit', () => {
    const def = { datatype: 'number' as const, unit: 'm2', min: 0 }
    expect(checkValue(def, 120, undefined, refs)).toBeNull()
    expect(checkValue(def, 120, 'm2', refs)).toBeNull()
    expect(checkValue(def, 120, 'kvm', refs)).toMatch(/unit must be m2/)
    expect(checkValue(def, -1, undefined, refs)).toMatch(/at least 0/)
    expect(checkValue(def, '120', undefined, refs)).toMatch(/number/)
  })

  it('checks choices, years, booleans and dates', () => {
    const choice = { datatype: 'choice' as const, options: ['a', 'b'] }
    expect(checkValue(choice, 'a', undefined, refs)).toBeNull()
    expect(checkValue(choice, 'c', undefined, refs)).toMatch(/one of a, b/)
    const now = new Date('2026-11-01')
    const year = { datatype: 'year' as const }
    expect(checkValue(year, 1995, undefined, refs, now)).toBeNull()
    expect(checkValue(year, 1995.5, undefined, refs, now)).not.toBeNull()
    expect(checkValue(year, 2040, undefined, refs, now)).not.toBeNull()
    expect(
      checkValue({ datatype: 'boolean' }, 'yes', undefined, refs)
    ).not.toBeNull()
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('28/2 2026')).toBe(false)
  })
})

const DOC = '01a19755-0000-7000-8000-000000000001'
const ROOF = '01a19755-0000-7000-8000-000000000002'
const OLD_PANEL = '01a19755-0000-7000-8000-000000000003'

const ctx: ChangeContext = {
  types: new Map<string, LibraryType>([
    [
      'roof_covering',
      {
        attributeSchema: {
          material: {
            label: { sv: 'Material' },
            datatype: 'choice',
            options: { sheet_metal: { sv: 'Plåt' }, tile: { sv: 'Tegel' } },
          },
          installation_year: { label: { sv: 'År' }, datatype: 'year' },
        },
        allowedSubcomponents: [],
      },
    ],
    [
      'electrical_installation',
      {
        attributeSchema: {},
        allowedSubcomponents: ['electrical_panel'],
      },
    ],
    ['electrical_panel', { attributeSchema: {}, allowedSubcomponents: [] }],
    ['pool', { attributeSchema: {}, allowedSubcomponents: [] }],
  ]),
  components: new Map([[ROOF, 'roof_covering']]),
  replaced: new Set([OLD_PANEL]),
  documents: new Set([DOC]),
}

const check = (input: unknown) =>
  validateChanges(changesInput.parse(input), ctx)

describe('validateChanges', () => {
  it('accepts a well-formed draft and warns about keys outside the library', () => {
    const r = check({
      houseValues: [
        { key: 'living_area', value: 132, confidence: 0.9, documentId: DOC },
        { key: 'absent_features', value: ['pool'], confidence: 0.8 },
        { key: 'view_of_lake', value: true, confidence: 0.6 },
      ],
      components: [
        { ref: 'el', type: 'electrical_installation' },
        { ref: 'panel', type: 'electrical_panel', parent: 'el' },
      ],
      componentValues: [
        {
          componentId: ROOF,
          values: [{ key: 'material', value: 'tile', confidence: 0.9 }],
        },
      ],
      workItems: [
        { component: 'panel', kind: 'REPAIR', description: 'Byt säkringar' },
      ],
    })
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([
      'houseValues.values[2] view_of_lake: not in the type library for the house; stored as given',
    ])
  })

  it('lists every problem at once', () => {
    const r = check({
      houseValues: [
        { key: 'living_area', value: 132, unit: 'kvm', confidence: 0.9 },
        { key: 'absent_features', value: ['jacuzzi'], confidence: 0.8 },
      ],
      components: [
        { ref: 'x', type: 'flux_capacitor' },
        { ref: 'panel', type: 'electrical_panel', parent: ROOF },
        { ref: 'new', type: 'electrical_panel', replaces: OLD_PANEL },
        {
          ref: 'roof',
          type: 'roof_covering',
          values: [
            { key: 'material', value: 'straw', confidence: 0.9 },
            {
              key: 'installation_year',
              value: 1995,
              confidence: 0.9,
              documentId: ROOF,
            },
          ],
        },
      ],
      workItems: [
        { component: 'later', kind: 'REPAIR', description: 'x' },
        { kind: 'REPAIR', description: 'y', yearMin: 2030, yearMax: 2028 },
      ],
    })
    expect(r.errors).toEqual([
      'houseValues.values[0] living_area: unit must be m2, convert the value first',
      'houseValues.values[1] absent_features: unknown component types jacuzzi',
      'components[0] flux_capacitor: unknown component type; pick one from type_library',
      'components[1] electrical_panel.parent: roof_covering does not take electrical_panel as a subcomponent (allowed: none)',
      `components[2] electrical_panel.replaces: component ${OLD_PANEL} has been replaced`,
      'components[3] roof_covering.values[0] material: must be one of sheet_metal, tile',
      `components[3] roof_covering.values[1] installation_year: no document ${ROOF} saved for this house; call save_document first`,
      'workItems[0].component: later is neither an earlier ref in this call nor a component id',
      'workItems[1]: yearMin is after yearMax',
    ])
  })

  it('refuses a parent declared after its child and an empty draft', () => {
    expect(
      check({
        components: [
          { ref: 'panel', type: 'electrical_panel', parent: 'el' },
          { ref: 'el', type: 'electrical_installation' },
        ],
      }).errors
    ).toHaveLength(1)
    expect(check({}).errors).toEqual(['nothing to propose'])
  })
})
