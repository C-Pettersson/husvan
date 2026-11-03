import { describe, expect, it } from 'vitest'
import { checkValue, isIsoDate } from '@/server/library/checkValue'
import {
  changesInput,
  corrections,
  draftEditInput,
  emptyChanges,
  validateChanges,
  validateDraftEdit,
  type ChangeContext,
  type DraftRows,
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
const FINDING = '01a19755-0000-7000-8000-000000000004'
const OLD_FINDING = '01a19755-0000-7000-8000-000000000005'
const NO_FINDING = '01a19755-0000-7000-8000-000000000006'

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
  workItems: new Map([[FINDING, ROOF]]),
  replacedWorkItems: new Set([OLD_FINDING]),
  pendingReplacements: new Map(),
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

  it('restates a current work item, once', () => {
    const restate = (replaces: string) => ({
      replaces,
      kind: 'REPAIR' as const,
      description: 'Laga hängrännan',
      costLowSek: 3000,
      costHighSek: 6000,
    })
    expect(check({ workItems: [restate(FINDING)] }).errors).toEqual([])
    expect(
      check({
        workItems: [
          restate(FINDING),
          restate(FINDING),
          restate(OLD_FINDING),
          restate(NO_FINDING),
        ],
      }).errors
    ).toEqual([
      `workItems[1].replaces: ${FINDING} is replaced twice`,
      `workItems[2].replaces: work item ${OLD_FINDING} has been replaced`,
      `workItems[3].replaces: no work item ${NO_FINDING} in this house; use get_house`,
    ])
  })

  it('refuses what another open draft already replaces', () => {
    const r = validateChanges(
      changesInput.parse({
        workItems: [{ replaces: FINDING, kind: 'REPAIR', description: 'x' }],
      }),
      { ...ctx, pendingReplacements: new Map([[FINDING, DOC]]) }
    )
    expect(r.errors).toEqual([
      `${FINDING} is already replaced in open draft ${DOC}; add to that draft with draftId, or let the user decide it first`,
    ])
  })
})

// A draft with a bathroom (with a subcomponent and a work item), a WC
// registered as a second bathroom, and a roof value.
const BATHROOM = '01a19755-0000-7000-8000-000000000011'
const BATHROOM_FLOOR = '01a19755-0000-7000-8000-000000000012'
const WC = '01a19755-0000-7000-8000-000000000013'
const AREA = '01a19755-0000-7000-8000-000000000021'
const YEAR = '01a19755-0000-7000-8000-000000000022'
const WC_AREA = '01a19755-0000-7000-8000-000000000023'
const HOUSE_YEAR = '01a19755-0000-7000-8000-000000000024'
const REGROUT = '01a19755-0000-7000-8000-000000000031'
const PAINT = '01a19755-0000-7000-8000-000000000032'

const rows: DraftRows = {
  components: [
    { id: BATHROOM, parentId: null },
    { id: BATHROOM_FLOOR, parentId: BATHROOM },
    { id: WC, parentId: null },
  ],
  observations: [
    { id: AREA, componentId: BATHROOM },
    { id: YEAR, componentId: BATHROOM_FLOOR },
    { id: WC_AREA, componentId: WC },
    { id: HOUSE_YEAR, componentId: null },
  ],
  workItems: [
    { id: REGROUT, componentId: BATHROOM },
    { id: PAINT, componentId: null },
  ],
}

const edit = (
  input: unknown,
  changes: unknown = emptyChanges,
  draft: DraftRows = rows
) =>
  validateDraftEdit(
    draftEditInput.parse(input),
    changesInput.parse(changes),
    draft
  )

describe('validateDraftEdit', () => {
  it('leaves out a component with its subcomponents, values and work items', () => {
    const r = edit({ removeComponents: [BATHROOM] })
    expect(r.errors).toEqual([])
    expect(r.remove).toEqual({
      components: [BATHROOM, BATHROOM_FLOOR],
      observations: [AREA, YEAR],
      workItems: [REGROUT],
      retractions: [],
    })
  })

  it('leaves out single values and work items, and takes additions', () => {
    const r = edit(
      { removeValues: [HOUSE_YEAR], removeWorkItems: [PAINT] },
      {
        houseValues: [{ key: 'construction_year', value: 1978, confidence: 1 }],
      }
    )
    expect(r.errors).toEqual([])
    expect(r.remove).toEqual({
      components: [],
      observations: [HOUSE_YEAR],
      workItems: [PAINT],
      retractions: [],
    })
  })

  it('refuses rows outside the draft, additions on a removed component and an empty call', () => {
    expect(
      edit(
        {
          removeComponents: [WC, ROOF],
          removeValues: [AREA, DOC],
          removeWorkItems: [FINDING],
        },
        {
          components: [{ ref: 'floor', type: 'floor', parent: WC }],
          componentValues: [
            {
              componentId: WC,
              values: [{ key: 'area', value: 2, confidence: 1 }],
            },
          ],
          workItems: [{ component: WC, kind: 'REPAIR', description: 'x' }],
        }
      ).errors
    ).toEqual([
      `removeComponents[1]: no component ${ROOF} in this draft`,
      `removeValues[1]: no value ${DOC} in this draft`,
      `removeWorkItems[0]: no work item ${FINDING} in this draft`,
      `components[0].parent: component ${WC} is removed in this call`,
      `componentValues[0]: component ${WC} is removed in this call`,
      `workItems[0].component: component ${WC} is removed in this call`,
    ])
    expect(edit({}).errors).toEqual(['nothing to change'])
  })
})

// Corrections of approved rows (CLAUDE.md, "Rättningar").
const GARAGE = '01a19755-0000-7000-8000-000000000011'
const GARAGE_ROOF = '01a19755-0000-7000-8000-000000000012'
const BATH = '01a19755-0000-7000-8000-000000000013'
const FLOOR_HEAT = '01a19755-0000-7000-8000-000000000014'
const DRAFT_ROW = '01a19755-0000-7000-8000-000000000015'
const AREA_VALUE = '01a19755-0000-7000-8000-000000000016'
const YEAR_VALUE = '01a19755-0000-7000-8000-000000000017'

const corrCtx: ChangeContext = {
  ...ctx,
  types: new Map<string, LibraryType>([
    ...ctx.types,
    [
      'garage',
      {
        attributeSchema: {},
        allowedSubcomponents: ['roof_covering', 'garage_door'],
      },
    ],
    [
      'bathroom',
      {
        attributeSchema: {
          area: { label: { sv: 'Yta' }, datatype: 'number', unit: 'm2' },
          wet_room_certified: { label: { sv: 'Intyg' }, datatype: 'boolean' },
        },
        allowedSubcomponents: ['underfloor_heating'],
      },
    ],
    [
      'wc',
      {
        attributeSchema: {
          area: { label: { sv: 'Yta' }, datatype: 'number', unit: 'm2' },
        },
        allowedSubcomponents: [],
      },
    ],
    ['underfloor_heating', { attributeSchema: {}, allowedSubcomponents: [] }],
  ]),
  components: new Map([
    [ROOF, 'roof_covering'],
    [GARAGE, 'garage'],
    [GARAGE_ROOF, 'roof_covering'],
    [BATH, 'bathroom'],
    [FLOOR_HEAT, 'underfloor_heating'],
    [DRAFT_ROW, 'pool'],
  ]),
  parents: new Map([
    [ROOF, null],
    [GARAGE, null],
    [GARAGE_ROOF, null],
    [BATH, null],
    [FLOOR_HEAT, BATH],
    [DRAFT_ROW, null],
  ]),
  draftComponents: new Set([DRAFT_ROW]),
  pendingCorrections: new Map(),
  values: new Map([
    [AREA_VALUE, { componentId: BATH, key: 'area' }],
    [YEAR_VALUE, { componentId: BATH, key: 'wet_room_certified' }],
  ]),
  pendingRetirements: new Map(),
}
const checkCorr = (input: unknown, c = corrCtx) =>
  validateChanges(changesInput.parse(input), c)

describe('corrections', () => {
  it('moves a garage roof under the garage and renames a facade', () => {
    const r = checkCorr({
      moveComponents: [{ componentId: GARAGE_ROOF, newParent: GARAGE }],
      renameComponents: [{ componentId: ROOF, name: 'Tegeltak, bostadshus' }],
    })
    expect(r.errors).toEqual([])
  })

  it('refuses a parent that does not take the type, a cycle and a draft row', () => {
    const r = checkCorr({
      moveComponents: [
        { componentId: GARAGE_ROOF, newParent: BATH },
        { componentId: BATH, newParent: FLOOR_HEAT },
        { componentId: DRAFT_ROW, newParent: null },
        { componentId: OLD_PANEL, newParent: null },
      ],
    })
    expect(r.errors).toEqual([
      `corrections ${GARAGE_ROOF}.newParent: bathroom does not take roof_covering as a subcomponent (allowed: underfloor_heating)`,
      `corrections ${BATH}.newParent: ${FLOOR_HEAT} is below ${BATH}`,
      `corrections ${BATH}.newParent: underfloor_heating does not take bathroom as a subcomponent (allowed: none)`,
      `corrections ${DRAFT_ROW}: component ${DRAFT_ROW} is a row of this draft; correct it with edit_draft`,
      `corrections ${OLD_PANEL}: component ${OLD_PANEL} has been replaced`,
    ])
  })

  it('retypes a bathroom to a wc, warns about values outside the new type and refuses kept subcomponents', () => {
    const r = checkCorr({
      retypeComponents: [
        { componentId: BATH, newType: 'wc', reason: 'Ingen dusch' },
      ],
    })
    expect(r.errors).toEqual([
      `corrections ${BATH}.newType: wc does not take the subcomponents ${FLOOR_HEAT}; move them first`,
    ])
    expect(r.warnings).toEqual([
      `corrections ${BATH}: values wet_room_certified are outside wc’s attributes and stay with the part; retire them if they no longer apply`,
    ])
    // Moving the floor heating out in the same call makes it valid.
    const ok = checkCorr({
      retypeComponents: [{ componentId: BATH, newType: 'wc' }],
      moveComponents: [{ componentId: FLOOR_HEAT, newParent: null }],
    })
    expect(ok.errors).toEqual([])
  })

  it('retires approved values once each and refuses unknown or pending ones', () => {
    const r = checkCorr(
      {
        retireValues: [
          { valueId: AREA_VALUE, reason: 'Fel rum' },
          { valueId: AREA_VALUE, reason: 'Igen' },
          { valueId: DOC, reason: 'Inget värde' },
          { valueId: YEAR_VALUE, reason: 'x' },
        ],
      },
      {
        ...corrCtx,
        pendingRetirements: new Map([[YEAR_VALUE, 'draft-1']]),
      }
    )
    expect(r.errors).toEqual([
      `retireValues[1]: ${AREA_VALUE} is retired twice`,
      `retireValues[2]: no approved value ${DOC} in this house; get_house gives each value its id`,
      `retireValues[3]: ${YEAR_VALUE} is already retired in open draft draft-1`,
    ])
  })

  it('refuses a component another draft already corrects', () => {
    const r = checkCorr(
      { renameComponents: [{ componentId: ROOF, name: 'x' }] },
      { ...corrCtx, pendingCorrections: new Map([[ROOF, 'draft-2']]) }
    )
    expect(r.errors).toEqual([
      `corrections ${ROOF}: component ${ROOF} is already corrected in open draft draft-2; add to that draft with draftId, or let the user decide it first`,
    ])
  })

  it('adds up moves, renames and retypes of one component to one correction', () => {
    expect(
      corrections(
        changesInput.parse({
          moveComponents: [{ componentId: BATH, newParent: null }],
          renameComponents: [{ componentId: BATH, name: 'Gäst-wc' }],
          retypeComponents: [{ componentId: BATH, newType: 'wc', reason: 'r' }],
        })
      )
    ).toEqual([
      {
        componentId: BATH,
        newParent: null,
        name: 'Gäst-wc',
        newType: 'wc',
        reason: 'r',
      },
    ])
  })
})
