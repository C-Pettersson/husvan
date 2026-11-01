// Shapes of the type library (CLAUDE.md, "Typbibliotek som växer" and
// "Konventioner"). Used by the seed and by everything that writes component
// types or validates observations against them.
//
// No path aliases in this file: the seed imports it with Node's type
// stripping, which does not resolve '@/'.
import { z } from 'zod'

const snakeCase = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/

export const keySchema = z
  .string()
  .regex(snakeCase, 'must be English snake_case ASCII')

// Labels for data that grows during operation. sv is required, en falls back
// to sv.
export const labelSchema = z.object({
  sv: z.string().min(1),
  en: z.string().min(1).optional(),
})

const base = { label: labelSchema, description: labelSchema.optional() }

export const attributeSchema = z.discriminatedUnion('datatype', [
  z.object({ ...base, datatype: z.literal('text') }),
  z.object({
    ...base,
    datatype: z.literal('number'),
    unit: z.string().min(1).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  z.object({ ...base, datatype: z.literal('year') }),
  z.object({ ...base, datatype: z.literal('date') }),
  z.object({ ...base, datatype: z.literal('boolean') }),
  z.object({
    ...base,
    datatype: z.literal('choice'),
    options: z
      .record(keySchema, labelSchema)
      .refine((o) => Object.keys(o).length > 0, 'needs at least one option'),
  }),
  z.object({ ...base, datatype: z.literal('actor') }),
  z.object({ ...base, datatype: z.literal('document') }),
  z.object({ ...base, datatype: z.literal('component') }),
])

export type AttributeDefinition = z.infer<typeof attributeSchema>

export const attributeSchemaMap = z.record(keySchema, attributeSchema)

export const conditionRuleSchema = z.object({
  // Which lifespan a condition score uses. 'soon' means replacement within
  // two years (CLAUDE.md, "Regler för beräkningen").
  '1': z.enum(['min', 'typical', 'max', 'soon']).optional(),
  '2': z.enum(['min', 'typical', 'max', 'soon']).optional(),
  '3': z.enum(['min', 'typical', 'max', 'soon']).optional(),
  '4': z.enum(['min', 'typical', 'max', 'soon']).optional(),
  '5': z.enum(['min', 'typical', 'max', 'soon']).optional(),
})

export const forecastDefaultsSchema = z.object({
  // Quantity per m2 living area when the component's own quantity is
  // missing, in the unit of the profile's costUnit.
  quantityPerLivingM2: z.number().positive().optional(),
  conditionRule: conditionRuleSchema.optional(),
  // Which match keys weigh most when several profiles fit, first wins (see
  // selectProfile). Required when a type's profiles match on different keys.
  profileKeyOrder: z.array(keySchema).optional(),
})

export const componentTypeSchema = z.object({
  type: keySchema,
  label: labelSchema,
  category: keySchema,
  attributeSchema: attributeSchemaMap,
  allowedSubcomponents: z.array(keySchema).default([]),
  forecastDefaults: forecastDefaultsSchema.default({}),
})

export type ComponentTypeDefinition = z.input<typeof componentTypeSchema>

const sourceSchema = z.object({
  name: z.string().min(1),
  url: z.url(),
  lifespanYears: z.number().positive().nullable().optional(),
  costSek: z.number().nonnegative().nullable().optional(),
  // When the source gives a range instead of one figure.
  lifespanYearsRange: z.tuple([z.number(), z.number()]).nullable().optional(),
  costSekRange: z.tuple([z.number(), z.number()]).nullable().optional(),
  note: z.string().optional(),
})

export const lifespanProfileSchema = z
  .object({
    type: keySchema,
    match: z.record(keySchema, z.string()).default({}),
    lifespanMinYears: z.number().int().positive(),
    lifespanTypicalYears: z.number().int().positive(),
    lifespanMaxYears: z.number().int().positive(),
    costLowSek: z.number().nonnegative().nullable(),
    costHighSek: z.number().nonnegative().nullable(),
    costUnit: z.enum(['EACH', 'M2', 'LINEAR_M', 'HOUSE']),
    priceYear: z.number().int().min(1990).nullable(),
    sources: z.array(sourceSchema).min(1),
  })
  .refine(
    (p) =>
      p.lifespanMinYears <= p.lifespanTypicalYears &&
      p.lifespanTypicalYears <= p.lifespanMaxYears,
    'lifespans must satisfy min <= typical <= max'
  )
  .refine(
    (p) =>
      p.costLowSek === null ||
      p.costHighSek === null ||
      p.costLowSek <= p.costHighSek,
    'costLowSek must not exceed costHighSek'
  )
  .refine(
    (p) =>
      (p.costLowSek === null && p.costHighSek === null) || p.priceYear !== null,
    'a profile with costs needs a priceYear'
  )

export type LifespanProfileDefinition = z.input<typeof lifespanProfileSchema>

// Checks that hold across the library: subcomponents and profile matches
// refer to types and choice options that exist.
export function validateLibrary(
  types: ComponentTypeDefinition[],
  profiles: LifespanProfileDefinition[]
): string[] {
  const errors: string[] = []
  const byType = new Map(types.map((t) => [t.type, t]))
  if (byType.size !== types.length) errors.push('duplicate component type')

  for (const t of types) {
    for (const sub of t.allowedSubcomponents ?? []) {
      if (!byType.has(sub))
        errors.push(`${t.type}: unknown subcomponent ${sub}`)
    }
  }

  for (const p of profiles) {
    const t = byType.get(p.type)
    if (!t) {
      errors.push(`profile for unknown type ${p.type}`)
      continue
    }
    for (const [key, value] of Object.entries(p.match ?? {})) {
      const attr = t.attributeSchema[key]
      if (!attr)
        errors.push(`${p.type}: profile matches unknown attribute ${key}`)
      else if (attr.datatype !== 'choice' || !(value in attr.options)) {
        errors.push(
          `${p.type}: profile matches ${key}=${value}, not a choice option`
        )
      }
    }
  }

  // Profiles matching on different keys can both fit one component, e.g.
  // material=cast_iron and renovation_method=relined. The type must then say
  // which key decides.
  for (const t of types) {
    const keySets = new Set(
      profiles
        .filter((p) => p.type === t.type)
        .map((p) =>
          Object.keys(p.match ?? {})
            .sort()
            .join(',')
        )
        .filter(Boolean)
    )
    if (keySets.size < 2) continue
    const order = t.forecastDefaults?.profileKeyOrder ?? []
    const keys = new Set([...keySets].flatMap((k) => k.split(',')))
    for (const key of keys) {
      if (!order.includes(key))
        errors.push(`${t.type}: profileKeyOrder lacks ${key}`)
    }
  }
  return errors
}
