// Plausibility checks on a house as read (CLAUDE.md, "Rimlighetskontroller"):
// what in the stored values looks wrong or incomplete, said next to the
// data so that Claude or the user can correct it. Nothing here changes a
// value or a figure; the forecast has its own flags for what it guesses.
// Each warning is a code with parameters and an English text; the web
// translates the code (messages, "warning").
import type { PrismaClient } from '@prisma/client'
import { forecastDefaultsSchema } from '@/server/library/schema'
import { HOUSE_KEYS } from '@/server/library/houseKeys'
import {
  BUILDINGS_WITH_ASSUMED_ROOF,
  BUILDING_TYPES,
  looksLikeOtherBuilding,
} from './buildings'
import { flatten, valueOf } from './derive'
import type { ComponentView, HouseView, KeyValueView } from './getHouse'

type Params = Record<string, string | number>

const ENGLISH = {
  bedroom_count_exceeds_rooms: (p: Params) =>
    `bedroom_count ${p.bedrooms} leaves no other room of room_count ${p.rooms}; one of them is likely wrong`,
  conflicting_values: (p: Params) =>
    `${p.key} has values that differ by more than ${p.percent} %: ${p.values}; the current one is ${p.current}`,
  key_not_in_library: (p: Params) =>
    `${p.key} is not an attribute of ${p.type} in the type library; the forecast does not read it`,
  house_key_not_in_library: (p: Params) =>
    `${p.key} is not a known key on the house; the forecast does not read it`,
  installation_year_without_evidence: (p: Params) =>
    `installation_year ${p.year} comes from Claude without a document or a quote; confirm it or lower its confidence`,
  installation_year_before_type: (p: Params) =>
    `installation_year ${p.year} is before ${p.earliest}, when the type first came into Swedish houses`,
  separate_building_part_at_top_level: (p: Params) =>
    `${p.type} "${p.name}" sits at top level but by its name belongs to a garage or an outbuilding, so it takes a share of the house's estimated area; move it under that building with its own area`,
  building_without_parts: (p: Params) =>
    `${p.type} "${p.name}" has no roof_covering under it; a building is priced through its parts, so it costs nothing in the forecast`,
  building_parts_assumed: (p: Params) =>
    `${p.type} "${p.name}" has no roof_covering under it; the forecast assumes one from the building's area, so register what the documents say`,
} satisfies Record<string, (p: Params) => string>

export type WarningCode = keyof typeof ENGLISH
export type Warning = {
  code: WarningCode
  params?: Params
  // The house itself when null.
  componentId: string | null
  text: string
}

const warn = (
  code: WarningCode,
  componentId: string | null,
  params?: Params
): Warning => ({
  code,
  params,
  componentId,
  text: ENGLISH[code](params ?? {}),
})

// Two values of one key count as conflicting when they differ by more than
// this share of the current one (111 against 117 m2).
export const CONFLICT_SHARE = 0.05

export type CheckLibrary = {
  // Attribute keys per type; a type missing here is unknown to the library.
  attributes: Map<string, Set<string>>
  earliestYear: Map<string, number>
}

export function houseWarnings(
  view: Pick<HouseView & object, 'values' | 'components'>,
  library: CheckLibrary
): Warning[] {
  const warnings: Warning[] = []
  const { values, components } = view

  const rooms = valueOf(values, 'room_count')
  const bedrooms = valueOf(values, 'bedroom_count')
  if (
    typeof rooms === 'number' &&
    typeof bedrooms === 'number' &&
    bedrooms > rooms - 1
  )
    warnings.push(
      warn('bedroom_count_exceeds_rooms', null, { rooms, bedrooms })
    )

  const conflicts = (list: KeyValueView[], componentId: string | null) => {
    for (const v of list) {
      const current = v.current.value
      if (typeof current !== 'number' || current === 0) continue
      const others = v.alternatives
        .map((a) => a.value)
        .filter(
          (a): a is number =>
            typeof a === 'number' &&
            Math.abs(a - current) / Math.abs(current) > CONFLICT_SHARE
        )
      if (others.length)
        warnings.push(
          warn('conflicting_values', componentId, {
            key: v.key,
            current,
            values: [current, ...others].join(', '),
            percent: CONFLICT_SHARE * 100,
          })
        )
    }
  }
  conflicts(values, null)
  for (const key of values.map((v) => v.key))
    if (!(key in HOUSE_KEYS))
      warnings.push(warn('house_key_not_in_library', null, { key }))

  for (const c of flatten(components)) {
    conflicts(c.values, c.id)
    const known = library.attributes.get(c.type)
    if (known)
      for (const v of c.values)
        if (!known.has(v.key))
          warnings.push(
            warn('key_not_in_library', c.id, { key: v.key, type: c.type })
          )
    const installed = c.values.find((v) => v.key === 'installation_year')
    if (installed && typeof installed.current.value === 'number') {
      const year = installed.current.value
      const row = installed.current
      if (row.source === 'CLAUDE' && !row.documentId && !row.quote)
        warnings.push(
          warn('installation_year_without_evidence', c.id, { year })
        )
      const earliest = library.earliestYear.get(c.type)
      if (earliest !== undefined && year < earliest)
        warnings.push(
          warn('installation_year_before_type', c.id, { year, earliest })
        )
    }
  }

  // Parts of another building registered at top level, and buildings with
  // nothing under them to price (CLAUDE.md, "Byggnader prissätts genom
  // sina delar").
  for (const c of components) {
    if (
      ['roof_covering', 'facade'].includes(c.type) &&
      looksLikeOtherBuilding(c.name)
    )
      warnings.push(
        warn('separate_building_part_at_top_level', c.id, {
          type: c.type,
          name: c.name ?? '',
        })
      )
  }
  for (const c of flatten(components)) {
    if (
      BUILDING_TYPES.includes(c.type) &&
      !pricedThroughKind(c) &&
      !c.children.some((x) => x.type === 'roof_covering')
    )
      warnings.push(
        warn(
          // A roof at top level named for the building holds the assumption
          // back; it has its own warning above.
          BUILDINGS_WITH_ASSUMED_ROOF.includes(c.type) &&
            !components.some(
              (x) =>
                x.type === 'roof_covering' && looksLikeOtherBuilding(x.name)
            )
            ? 'building_parts_assumed'
            : 'building_without_parts',
          c.id,
          {
            type: c.type,
            name: c.name ?? '',
          }
        )
      )
  }
  return warnings
}

// A shed, woodshed or friggebod has a lifespan profile of its own per m2
// and needs no parts under it.
const SHED_KINDS = ['storage_shed', 'woodshed', 'friggebod']
const pricedThroughKind = (c: ComponentView) => {
  const kind = valueOf(c.values, 'building_kind')
  return c.type === 'outbuilding' && typeof kind === 'string'
    ? SHED_KINDS.includes(kind)
    : false
}

// The library as the checks need it, from the database.
export async function loadCheckLibrary(
  prisma: PrismaClient
): Promise<CheckLibrary> {
  const types = await prisma.componentType.findMany({
    select: { type: true, attributeSchema: true, forecastDefaults: true },
  })
  const earliestYear = new Map<string, number>()
  for (const t of types) {
    const year = forecastDefaultsSchema.safeParse(t.forecastDefaults).data
      ?.earliestYear
    if (year !== undefined) earliestYear.set(t.type, year)
  }
  return {
    attributes: new Map(
      types.map((t) => [
        t.type,
        new Set(Object.keys((t.attributeSchema ?? {}) as object)),
      ])
    ),
    earliestYear,
  }
}

export async function warningsFor(
  prisma: PrismaClient,
  view: NonNullable<HouseView>
) {
  return houseWarnings(view, await loadCheckLibrary(prisma))
}
