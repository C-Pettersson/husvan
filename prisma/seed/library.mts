import type { Prisma, PrismaClient } from '@prisma/client'
import {
  componentTypeSchema,
  lifespanProfileSchema,
  validateLibrary,
} from '../../src/server/library/schema.ts'
import {
  differs,
  mergeType,
  pick,
  type SeedMode,
  type StoredType,
} from '../../src/server/library/seedMerge.ts'
import { componentTypes } from '../data/componentTypes.mts'
import { lifespanProfiles } from '../data/lifespanProfiles.mts'

// Upserts the type library and its lifespan profiles (seedMerge.ts). In full
// mode the repository's keys overwrite the stored ones and what was created
// in operation is kept; in add-only mode nothing stored changes and only
// missing types, attribute keys and profiles are added.
export async function seedLibrary(
  prisma: PrismaClient,
  mode: SeedMode = 'full'
) {
  const errors = validateLibrary(componentTypes, lifespanProfiles)
  if (errors.length)
    throw new Error(`Type library is invalid:\n${errors.join('\n')}`)
  const addOnly = mode === 'add_only'
  const wouldChange: string[] = []

  let newTypes = 0
  for (const input of componentTypes) {
    const t = componentTypeSchema.parse(input)
    const existing = await prisma.componentType.findUnique({
      where: { type: t.type },
    })
    const seed: StoredType = {
      label: t.label,
      category: t.category,
      attributeSchema: t.attributeSchema,
      allowedSubcomponents: t.allowedSubcomponents,
      forecastDefaults: t.forecastDefaults ?? {},
    }
    const stored: StoredType | null = existing && {
      label: existing.label as StoredType['label'],
      category: existing.category,
      attributeSchema:
        existing.attributeSchema as StoredType['attributeSchema'],
      allowedSubcomponents: existing.allowedSubcomponents,
      forecastDefaults:
        existing.forecastDefaults as StoredType['forecastDefaults'],
    }
    const data = mergeType(seed, stored, mode)
    if (!existing) newTypes++
    // What a full seed would still change after this run.
    if (addOnly && stored && differs(mergeType(seed, stored, 'full'), data))
      wouldChange.push(`type ${t.type}`)
    // A row the merge leaves as it is is not written at all.
    if (stored && !differs(data, stored)) continue
    const row = {
      label: data.label as Prisma.InputJsonValue,
      category: data.category,
      attributeSchema: data.attributeSchema as Prisma.InputJsonValue,
      allowedSubcomponents: data.allowedSubcomponents,
      forecastDefaults: data.forecastDefaults as Prisma.InputJsonValue,
    }
    await prisma.componentType.upsert({
      where: { type: t.type },
      update: row,
      create: { type: t.type, ...row },
    })
  }

  // A profile is identified by its type and match. Profiles that are no longer
  // in the seed are left alone.
  let created = 0
  for (const input of lifespanProfiles) {
    const p = lifespanProfileSchema.parse(input)
    const existing = await prisma.lifespanProfile.findFirst({
      where: { type: p.type, match: { equals: p.match } },
    })
    const data = { ...p, sources: p.sources as Prisma.InputJsonValue[] }
    if (existing) {
      const same = !differs(p, pick(existing, Object.keys(p)))
      if (addOnly) {
        if (!same)
          wouldChange.push(`profile ${p.type} ${JSON.stringify(p.match)}`)
        continue
      }
      if (same) continue
      await prisma.lifespanProfile.update({ where: { id: existing.id }, data })
    } else {
      await prisma.lifespanProfile.create({ data })
      created++
    }
  }

  console.log(
    `Seeded ${componentTypes.length} component types (${newTypes} new) and ${lifespanProfiles.length} lifespan profiles (${created} new)`
  )
  if (wouldChange.length)
    console.log(
      `Add-only: ${wouldChange.length} stored row(s) differ from the repository and were left alone; a full seed would change them:\n  ${wouldChange.join('\n  ')}`
    )
}
