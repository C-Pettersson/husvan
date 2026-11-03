// Houses exported from the local database (scripts/forecast-fixtures.test.ts)
// as the forecast tests read them: the house as getHouse gave it, with the
// library built from the repository's data files, so that a change to a
// type or a profile shows in the figures at once.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { componentTypes } from '../../../../prisma/data/componentTypes.mts'
import { lifespanProfiles } from '../../../../prisma/data/lifespanProfiles.mts'
import type { HouseView } from '@/server/houses/getHouse'
import {
  componentTypeSchema,
  lifespanProfileSchema,
} from '@/server/library/schema'
import type { ProfileRow } from '../plan'
import { buildLibrary, type LoadedLibrary } from '../run'

export type Fixture = {
  exportedAt: string
  house: Omit<NonNullable<HouseView>, 'drafts' | 'preview'>
  bki: Record<string, number>
}

export const FIXTURES = [
  'yxgrand-6',
  'mjardgatan-1',
  'bredviksvagen-15',
  'ytterviksvagen-30a',
] as const
export type FixtureName = (typeof FIXTURES)[number]

// JSON dates come back as strings.
function revive(key: string, value: unknown) {
  return (key === 'recordedAt' || key === 'documentDate' || key === 'asOf') &&
    typeof value === 'string'
    ? new Date(value)
    : value
}

export function loadFixture(name: FixtureName): Fixture {
  return JSON.parse(
    readFileSync(resolve(__dirname, `${name}.json`), 'utf8'),
    revive
  )
}

// The library from the repository's data, priced with the fixture's index.
export function fixtureLibrary(
  fixture: Fixture,
  startYear: number
): LoadedLibrary {
  const types = componentTypes.map((t) => componentTypeSchema.parse(t))
  const profiles = lifespanProfiles.map((p): ProfileRow => {
    const row = lifespanProfileSchema.parse(p)
    return {
      type: row.type,
      match: row.match,
      lifespanMinYears: row.lifespanMinYears,
      lifespanTypicalYears: row.lifespanTypicalYears,
      lifespanMaxYears: row.lifespanMaxYears,
      costLowSek: row.costLowSek,
      costHighSek: row.costHighSek,
      costUnit: row.costUnit,
      priceYear: row.priceYear,
      repaintMinYears: row.repaintMinYears,
      repaintTypicalYears: row.repaintTypicalYears,
      repaintMaxYears: row.repaintMaxYears,
      repaintCostLowSek: row.repaintCostLowSek,
      repaintCostHighSek: row.repaintCostHighSek,
    }
  })
  const byYear = new Map(
    Object.entries(fixture.bki).map(([y, v]) => [Number(y), [v]])
  )
  return buildLibrary(types, profiles, byYear, startYear)
}
