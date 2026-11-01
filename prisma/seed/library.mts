import type { Prisma, PrismaClient } from '@prisma/client'
import {
  componentTypeSchema,
  lifespanProfileSchema,
  validateLibrary,
} from '../../src/server/library/schema.ts'
import { componentTypes } from '../data/componentTypes.mts'
import { lifespanProfiles } from '../data/lifespanProfiles.mts'

// Upserts the type library and its lifespan profiles. Types and attributes
// created during operation are kept: the seed only adds or overwrites the keys
// it defines itself.
export async function seedLibrary(prisma: PrismaClient) {
  const errors = validateLibrary(componentTypes, lifespanProfiles)
  if (errors.length)
    throw new Error(`Type library is invalid:\n${errors.join('\n')}`)

  for (const input of componentTypes) {
    const t = componentTypeSchema.parse(input)
    const existing = await prisma.componentType.findUnique({
      where: { type: t.type },
    })
    const data = {
      label: t.label,
      category: t.category,
      attributeSchema: {
        ...(existing?.attributeSchema as object | undefined),
        ...t.attributeSchema,
      },
      allowedSubcomponents: [
        ...new Set([
          ...(existing?.allowedSubcomponents ?? []),
          ...t.allowedSubcomponents,
        ]),
      ],
      forecastDefaults: {
        ...(existing?.forecastDefaults as object | undefined),
        ...t.forecastDefaults,
      },
    }
    await prisma.componentType.upsert({
      where: { type: t.type },
      update: data,
      create: { type: t.type, ...data },
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
      await prisma.lifespanProfile.update({ where: { id: existing.id }, data })
    } else {
      await prisma.lifespanProfile.create({ data })
      created++
    }
  }

  console.log(
    `Seeded ${componentTypes.length} component types and ${lifespanProfiles.length} lifespan profiles (${created} new)`
  )
}
