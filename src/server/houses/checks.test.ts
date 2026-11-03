import { describe, expect, it } from 'vitest'
import type { ComponentView, KeyValueView, ValueRow } from './getHouse'
import { houseWarnings, type CheckLibrary } from './checks'
import { looksLikeOtherBuilding } from './buildings'

let n = 0
const row = (
  key: string,
  value: unknown,
  extra: Partial<ValueRow> = {}
): ValueRow => ({
  id: `o${n++}`,
  key,
  value: value as never,
  unit: null,
  source: 'CLAUDE',
  confidence: 0.9,
  quote: 'citat',
  documentId: 'doc',
  recordedAt: new Date(0),
  draft: false,
  ...extra,
})
const kv = (
  key: string,
  value: unknown,
  alternatives: unknown[] = []
): KeyValueView => ({
  key,
  current: row(key, value),
  alternatives: alternatives.map((a) => row(key, a)),
})
const comp = (
  type: string,
  values: KeyValueView[] = [],
  more: Partial<ComponentView> = {}
): ComponentView => ({
  id: `c${n++}`,
  type,
  name: null,
  draft: false,
  values,
  children: [],
  ...more,
})
const library: CheckLibrary = {
  attributes: new Map([
    ['roof_covering', new Set(['installation_year', 'material', 'area'])],
    ['ev_charger', new Set(['installation_year'])],
  ]),
  earliestYear: new Map([['ev_charger', 2010]]),
}
const codes = (values: KeyValueView[], components: ComponentView[] = []) =>
  houseWarnings({ values, components }, library).map((w) => w.code)

describe('houseWarnings', () => {
  it('doubts a bedroom count that leaves no other room', () => {
    expect(codes([kv('room_count', 4), kv('bedroom_count', 4)])).toContain(
      'bedroom_count_exceeds_rooms'
    )
    expect(codes([kv('room_count', 4), kv('bedroom_count', 3)])).toEqual([])
  })

  it('reports values of one key that differ by more than 5 %', () => {
    const w = houseWarnings(
      { values: [kv('living_area', 111, [117, 112])], components: [] },
      library
    )
    expect(w).toHaveLength(1)
    expect(w[0].text).toBe(
      'living_area has values that differ by more than 5 %: 111, 117; the current one is 111'
    )
  })

  it('names keys the library does not know, on the house and on a part', () => {
    expect(codes([kv('radon_bq_per_m3', 50)])).toEqual([
      'house_key_not_in_library',
    ])
    expect(codes([], [comp('roof_covering', [kv('colour', 'red')])])).toEqual([
      'key_not_in_library',
    ])
    // A type the library lacks is not checked key by key.
    expect(codes([], [comp('unknown_type', [kv('x', 1)])])).toEqual([])
  })

  it('asks for evidence of an installation year Claude gave without any', () => {
    const bare: KeyValueView = {
      key: 'installation_year',
      current: row('installation_year', 2001, {
        quote: null,
        documentId: null,
      }),
      alternatives: [],
    }
    expect(codes([], [comp('roof_covering', [bare])])).toEqual([
      'installation_year_without_evidence',
    ])
    // A quote, a document or the user's own value is enough.
    expect(
      codes([], [comp('roof_covering', [kv('installation_year', 2001)])])
    ).toEqual([])
    const user: KeyValueView = {
      ...bare,
      current: { ...bare.current, source: 'USER' },
    }
    expect(codes([], [comp('roof_covering', [user])])).toEqual([])
  })

  it('doubts an installation year before the type came into Swedish houses', () => {
    expect(
      codes([], [comp('ev_charger', [kv('installation_year', 1998)])])
    ).toEqual(['installation_year_before_type'])
  })

  it('points out a garage roof at top level and a garage without parts', () => {
    const w = houseWarnings(
      {
        values: [],
        components: [
          comp('roof_covering', [], { name: 'Tak, garage' }),
          comp('garage', [], { name: 'Fristående garage' }),
          comp('garage', [], {
            name: 'Med tak',
            children: [comp('roof_covering', [kv('area', 30)])],
          }),
          comp('outbuilding', [kv('building_kind', 'storage_shed')]),
        ],
      },
      library
    )
    expect(w.map((x) => x.code)).toEqual([
      'separate_building_part_at_top_level',
      'building_without_parts',
    ])
    expect(w[0].text).toContain('"Tak, garage"')
    expect(w[1].text).toContain('"Fristående garage"')
  })
})

describe('looksLikeOtherBuilding', () => {
  it('reads Swedish part names', () => {
    for (const name of [
      'Tak, garage',
      'Papptak, garage',
      'Fasad, förråd',
      'Plåttak uthuset',
      'Tak på vedboden',
      'Carport, tak',
      'Gäststuga, fasad',
    ])
      expect(looksLikeOtherBuilding(name), name).toBe(true)
    for (const name of ['Sadeltak, bostadshus', 'Träpanel, ommålad 2024', null])
      expect(looksLikeOtherBuilding(name), String(name)).toBe(false)
  })
})
