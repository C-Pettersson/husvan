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

const sourceSchema = z.object({
  name: z.string().min(1),
  url: z.url(),
  // What the figures are about; replacement unless stated.
  about: z.enum(['replacement', 'repaint']).optional(),
  lifespanYears: z.number().positive().nullable().optional(),
  costSek: z.number().nonnegative().nullable().optional(),
  // When the source gives a range instead of one figure.
  lifespanYearsRange: z.tuple([z.number(), z.number()]).nullable().optional(),
  costSekRange: z.tuple([z.number(), z.number()]).nullable().optional(),
  note: z.string().optional(),
})

const years = z.number().int().positive()

// A repaint interval, min <= typical <= max years.
const intervalSchema = z
  .object({ minYears: years, typicalYears: years, maxYears: years })
  .refine(
    (i) => i.minYears <= i.typicalYears && i.typicalYears <= i.maxYears,
    'intervals must satisfy min <= typical <= max'
  )

export const forecastDefaultsSchema = z.object({
  // Quantity per m2 living area when the component's own quantity is
  // missing, in the unit of the profile's costUnit.
  quantityPerLivingM2: z.number().positive().optional(),
  // Quantity from the footprint (living_area / floor_count) instead, when
  // the number of floors is known: factor times the footprint's area, its
  // perimeter, or its perimeter times the floors (wall height for a facade).
  quantityFromFootprint: z
    .object({
      basis: z.enum(['area', 'perimeter', 'wall']),
      factor: z.number().positive(),
    })
    .optional(),
  // A usual quantity, in the unit of the profile's costUnit, for a part
  // whose own is missing and that nothing in the house can estimate: a shed
  // of 12 m2, a driveway of 60 m2. Flagged as assumed. On a building
  // (separateBuilding) it is also the area its parts are estimated from when
  // the building states none: a garage of 30 m2.
  assumedQuantity: z.number().positive().optional(),
  // The usual quantity instead when the part's name says it is an entrance,
  // not a terrace: an entrébro of 5 m2 registered as a deck.
  assumedEntranceQuantity: z.number().positive().optional(),
  // How much of a lifespan a partial renovation gives, counted from that
  // year, where the part renewed is more of the whole than the default third:
  // the fan motor of a ventilation unit.
  partialRenovationShare: z.number().positive().max(1).optional(),
  // Attributes read from another component of the house, attribute to
  // component type, such as drainage priced by the foundation type. The
  // component's own value wins; profiles may match on them.
  context: z.record(keySchema, keySchema).optional(),
  // Not assumed when the context has one of these values, such as no
  // drainage on a plinth foundation.
  assumeUnless: z.record(keySchema, z.array(z.string()).min(1)).optional(),
  // A house often has several, such as bathrooms: each one says how many,
  // so the reader can weigh urgency.
  oneOfSeveral: z.boolean().optional(),
  conditionRule: conditionRuleSchema.optional(),
  // Which match keys weigh most when several profiles fit, first wins (see
  // selectProfile). Required when a type's profiles match on different keys.
  profileKeyOrder: z.array(keySchema).optional(),
  // Repaint interval per paint_type option, used instead of the profile's
  // when the paint type is known.
  repaintByPaintType: z
    .record(
      keySchema,
      intervalSchema.and(z.object({ sources: z.array(sourceSchema).min(1) }))
    )
    .optional(),
  // Every house has one: when no component of the type is documented and
  // absent_features does not name it, the forecast assumes one from the
  // construction year.
  assumeUndocumented: z.boolean().optional(),
  // The assumption holds only for houses that have one of these parts, such
  // as radiators where the heat source is water-borne, or a chimney where
  // there is a stove.
  assumeWhenTypes: z.array(keySchema).min(1).optional(),
  // Not assumed when the house has, at top level, a part that does the same
  // job: water underfloor heating in place of radiators. `where` narrows it
  // to choice values; an unknown value does not rule the assumption out.
  assumeUnlessParts: z
    .array(
      z.object({
        type: keySchema,
        where: z.record(keySchema, z.array(z.string()).min(1)).optional(),
      })
    )
    .min(1)
    .optional(),
  // Further assumed parts of the type with given choice values, when the
  // context says so and no documented part of the type has those values:
  // the sewer section under the slab of a house on a slab on ground. They
  // come in addition to assumeUndocumented's plain part.
  assumeVariants: z
    .array(
      z.object({
        values: z.record(keySchema, z.string()),
        whenContext: z.record(keySchema, z.array(z.string()).min(1)),
      })
    )
    .min(1)
    .optional(),
  // Another attribute that gives the part's year when installation_year is
  // missing: the attic's additional_insulation_year.
  installationYearKey: keySchema.optional(),
  // The first year the type was realistically installed in Swedish houses.
  // A part without installation_year in an older house counts from this
  // year, not the construction year: a 1979 house's charger is not from 1979.
  earliestYear: z.number().int().min(1900).max(2100).optional(),
  // A building of its own on the plot, such as a garage: the parts under it
  // state their own quantities or are estimated from the building's area,
  // neither take from nor count toward the house's estimated quantities, and
  // do not stand in for a part the house itself is assumed to have.
  separateBuilding: z.boolean().optional(),
  // Subcomponent types a building must have although nothing registers them,
  // assumed under it from its area: a garage's roof and facade.
  assumeParts: z.array(keySchema).min(1).optional(),
  // A cheaper renewal than replacement when the component's attributes are
  // among `when` or unknown, such as relining a cast-iron pipe. Low and typical renew
  // with the profile that `match` selects; high replaces.
  cheaperRenewal: z
    .object({
      when: z.record(keySchema, z.array(z.string()).min(1)),
      match: z.record(keySchema, z.string()),
    })
    .optional(),
  // An inspection that shows whether and how the parts must be renewed,
  // such as filming the sewer pipes. Once per house, before the first
  // renewal of a part without an inspected_year.
  inspection: z
    .object({
      costLowSek: z.number().nonnegative(),
      costHighSek: z.number().nonnegative(),
      priceYear: z.number().int().min(1990),
      sources: z.array(sourceSchema).min(1),
    })
    .refine(
      (i) => i.costLowSek <= i.costHighSek,
      'costLowSek must not exceed costHighSek'
    )
    .optional(),
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
    // Recurring repainting, in the same costUnit and priceYear.
    repaintMinYears: years.nullable().default(null),
    repaintTypicalYears: years.nullable().default(null),
    repaintMaxYears: years.nullable().default(null),
    repaintCostLowSek: z.number().nonnegative().nullable().default(null),
    repaintCostHighSek: z.number().nonnegative().nullable().default(null),
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
  .refine((p) => {
    const interval = [
      p.repaintMinYears,
      p.repaintTypicalYears,
      p.repaintMaxYears,
    ]
    const costs = [p.repaintCostLowSek, p.repaintCostHighSek]
    if (interval.every((v) => v === null)) return costs.every((v) => v === null)
    return (
      interval.every((v) => v !== null) &&
      p.repaintMinYears! <= p.repaintTypicalYears! &&
      p.repaintTypicalYears! <= p.repaintMaxYears! &&
      costs.every((v) => v !== null) &&
      p.repaintCostLowSek! <= p.repaintCostHighSek! &&
      p.priceYear !== null
    )
  }, 'repainting needs all of min <= typical <= max years, low <= high cost and a priceYear, or none of them')

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
    for (const part of t.forecastDefaults?.assumeParts ?? []) {
      if (!t.allowedSubcomponents?.includes(part))
        errors.push(`${t.type}: assumes ${part}, not an allowed subcomponent`)
    }
  }

  for (const p of profiles) {
    const t = byType.get(p.type)
    if (!t) {
      errors.push(`profile for unknown type ${p.type}`)
      continue
    }
    for (const [key, value] of Object.entries(p.match ?? {})) {
      const from = t.forecastDefaults?.context?.[key]
      const attr = from
        ? byType.get(from)?.attributeSchema[key]
        : t.attributeSchema[key]
      if (!attr)
        errors.push(`${p.type}: profile matches unknown attribute ${key}`)
      else if (attr.datatype !== 'choice' || !(value in attr.options)) {
        errors.push(
          `${p.type}: profile matches ${key}=${value}, not a choice option`
        )
      }
    }
  }

  // Context comes from a type that has the attribute, and what rules an
  // assumption out names its options.
  for (const t of types) {
    const context = t.forecastDefaults?.context ?? {}
    for (const [key, from] of Object.entries(context)) {
      if (!byType.get(from)?.attributeSchema[key])
        errors.push(`${t.type}: context ${key} not an attribute of ${from}`)
    }
    for (const [key, values] of Object.entries(
      t.forecastDefaults?.assumeUnless ?? {}
    )) {
      const from = context[key]
      const attr = from ? byType.get(from)?.attributeSchema[key] : undefined
      if (!attr) errors.push(`${t.type}: assumeUnless ${key} is not context`)
      else
        for (const value of values)
          if (attr.datatype !== 'choice' || !(value in attr.options))
            errors.push(
              `${t.type}: assumeUnless names ${key}=${value}, not a choice option`
            )
    }
    for (const variant of t.forecastDefaults?.assumeVariants ?? []) {
      for (const [key, value] of Object.entries(variant.values)) {
        const attr = t.attributeSchema[key]
        if (attr?.datatype !== 'choice' || !(value in attr.options))
          errors.push(
            `${t.type}: assumeVariants names ${key}=${value}, not a choice option`
          )
      }
      for (const [key, values] of Object.entries(variant.whenContext)) {
        const from = context[key]
        const attr = from ? byType.get(from)?.attributeSchema[key] : undefined
        if (!attr)
          errors.push(`${t.type}: assumeVariants ${key} is not context`)
        else
          for (const value of values)
            if (attr.datatype !== 'choice' || !(value in attr.options))
              errors.push(
                `${t.type}: assumeVariants names ${key}=${value}, not a choice option`
              )
      }
    }
    for (const type of t.forecastDefaults?.assumeWhenTypes ?? [])
      if (!byType.has(type))
        errors.push(`${t.type}: assumeWhenTypes names unknown type ${type}`)
    for (const part of t.forecastDefaults?.assumeUnlessParts ?? []) {
      const other = byType.get(part.type)
      if (!other) {
        errors.push(
          `${t.type}: assumeUnlessParts names unknown type ${part.type}`
        )
        continue
      }
      for (const [key, values] of Object.entries(part.where ?? {})) {
        const attr = other.attributeSchema[key]
        for (const value of values)
          if (attr?.datatype !== 'choice' || !(value in attr.options))
            errors.push(
              `${t.type}: assumeUnlessParts names ${part.type}.${key}=${value}, not a choice option`
            )
      }
    }
  }

  // Paint types with their own repaint interval must be options of the
  // type's paint_type.
  for (const t of types) {
    const paintTypes = Object.keys(t.forecastDefaults?.repaintByPaintType ?? {})
    if (!paintTypes.length) continue
    const attr = t.attributeSchema.paint_type
    for (const paintType of paintTypes) {
      if (attr?.datatype !== 'choice' || !(paintType in attr.options))
        errors.push(
          `${t.type}: repaint interval for unknown paint_type ${paintType}`
        )
    }
  }

  // A cheaper renewal must name choice options and select a profile.
  for (const t of types) {
    const renewal = t.forecastDefaults?.cheaperRenewal
    if (!renewal) continue
    for (const [key, values] of [
      ...Object.entries(renewal.when),
      ...Object.entries(renewal.match).map(([k, v]) => [k, [v]] as const),
    ]) {
      const attr = t.attributeSchema[key]
      for (const value of values)
        if (attr?.datatype !== 'choice' || !(value in attr.options))
          errors.push(
            `${t.type}: cheaperRenewal names ${key}=${value}, not a choice option`
          )
    }
    const matches = (p: LifespanProfileDefinition) =>
      Object.entries(renewal.match).every(([k, v]) => p.match?.[k] === v)
    if (!profiles.some((p) => p.type === t.type && matches(p)))
      errors.push(`${t.type}: no profile matches cheaperRenewal`)
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
