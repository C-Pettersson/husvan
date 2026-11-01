// What a draft may contain and how it is checked against the type library
// before anything is written (CLAUDE.md, "Skrivflöde": drafts are validated
// at propose_changes, so Claude gets the error while it has the document in
// front of it). Shared by create_house, propose_changes and add_work_item.
import { z } from 'zod'
import {
  checkValue,
  fromAttribute,
  fromHouseKey,
  type References,
} from '@/server/library/checkValue'
import { HOUSE_KEYS } from '@/server/library/houseKeys'
import { keySchema, type AttributeDefinition } from '@/server/library/schema'

export const valueInput = z.object({
  key: keySchema,
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .describe(
      'Number, year, text, choice option key, true/false, ISO date, or a list of strings for absent_features.'
    ),
  unit: z
    .string()
    .optional()
    .describe(
      'Omit to use the unit the key defines. Another unit is refused, so convert first.'
    ),
  documentId: z
    .uuid()
    .optional()
    .describe('The saved document the value comes from.'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      'How sure the reading is, 0 to 1. Below 0.7 widens the forecast range.'
    ),
  quote: z
    .string()
    .max(2000)
    .optional()
    .describe('The passage in the document that supports the value, verbatim.'),
})

export type ValueInput = z.infer<typeof valueInput>

export const componentInput = z.object({
  ref: z
    .string()
    .min(1)
    .describe(
      'Your own label for the component within this call, e.g. "roof". parent and workItems[].component can name it.'
    ),
  type: keySchema.describe('A component type from type_library.'),
  name: z
    .string()
    .max(200)
    .optional()
    .describe(
      'Short Swedish name the user recognises, e.g. "Sadeltak, bostadshus".'
    ),
  parent: z
    .string()
    .optional()
    .describe(
      'ref of an earlier component in this call, or the id of an existing component. The parent type must allow this type as a subcomponent.'
    ),
  replaces: z
    .uuid()
    .optional()
    .describe(
      'Id of the existing component this one replaced, e.g. a relined sewer pipe or a new electrical panel.'
    ),
  values: z.array(valueInput).default([]),
})

export const componentValuesInput = z.object({
  componentId: z.uuid().describe('An existing component of the house.'),
  values: z.array(valueInput).min(1),
})

export const workItemInput = z.object({
  component: z
    .string()
    .optional()
    .describe(
      'ref of a component in this call, or the id of an existing component.'
    ),
  kind: z
    .enum(['REPLACEMENT', 'REPAIR', 'INVESTIGATION'])
    .describe(
      'REPLACEMENT of the component (takes the place of its term in the maintenance debt), REPAIR, or INVESTIGATION (a recommended survey such as filming the sewer line).'
    ),
  description: z
    .string()
    .min(1)
    .max(1000)
    .describe('What needs doing, in Swedish, the user’s language.'),
  yearMin: z
    .int()
    .min(2000)
    .max(2100)
    .optional()
    .describe(
      'Earliest calendar year. "Inom 1–3 år" in a report from 2026 is 2027 to 2029.'
    ),
  yearMax: z.int().min(2000).max(2100).optional(),
  costLowSek: z.number().nonnegative().optional(),
  costHighSek: z.number().nonnegative().optional(),
  documentId: z.uuid().optional(),
  quote: z.string().max(2000).optional(),
})

export type WorkItemInput = z.infer<typeof workItemInput>

export const changesShape = {
  houseValues: z
    .array(valueInput)
    .default([])
    .describe(
      'Values about the house itself; the keys are in type_library under houseKeys.'
    ),
  components: z.array(componentInput).default([]),
  componentValues: z
    .array(componentValuesInput)
    .default([])
    .describe('New values for components that already exist.'),
  workItems: z.array(workItemInput).default([]),
}

export const changesInput = z.object(changesShape)
export type ChangesInput = z.infer<typeof changesInput>

export type LibraryType = {
  attributeSchema: Record<string, AttributeDefinition>
  allowedSubcomponents: string[]
}

// What a draft may point at. components holds the house's current
// components (approved, or in the draft being added to), id to type;
// replaced holds those another visible component has replaced.
export type ChangeContext = {
  types: Map<string, LibraryType>
  components: Map<string, string>
  replaced: Set<string>
  documents: Set<string>
}

export type Problems = { errors: string[]; warnings: string[] }

export function validateChanges(
  input: ChangesInput,
  ctx: ChangeContext
): Problems {
  const errors: string[] = []
  const warnings: string[] = []
  // Components of this call, ref to type, in the order they are declared.
  const declared = new Map<string, string>()
  const refs: References = {
    documents: ctx.documents,
    components: new Set(ctx.components.keys()),
  }

  const existing = (id: string, path: string) => {
    if (ctx.replaced.has(id)) {
      errors.push(`${path}: component ${id} has been replaced`)
      return undefined
    }
    const type = ctx.components.get(id)
    if (!type)
      errors.push(`${path}: no component ${id} in this house; use get_house`)
    return type
  }
  // A ref declared earlier in this call, or an existing component.
  const resolve = (target: string, path: string) => {
    const type = declared.get(target)
    if (type) return type
    if (z.uuid().safeParse(target).success) return existing(target, path)
    errors.push(
      `${path}: ${target} is neither an earlier ref in this call nor a component id`
    )
    return undefined
  }

  const checkValues = (
    values: ValueInput[],
    path: string,
    type: string | null
  ) => {
    const schema = type ? ctx.types.get(type)?.attributeSchema : undefined
    values.forEach((v, i) => {
      const at = `${path}.values[${i}] ${v.key}`
      if (v.documentId && !ctx.documents.has(v.documentId))
        errors.push(
          `${at}: no document ${v.documentId} saved for this house; call save_document first`
        )
      const def = type
        ? schema?.[v.key] && fromAttribute(schema[v.key])
        : HOUSE_KEYS[v.key] && fromHouseKey(HOUSE_KEYS[v.key])
      if (!def) {
        warnings.push(
          `${at}: not in the type library for ${type ?? 'the house'}; stored as given`
        )
        return
      }
      const problem = checkValue(def, v.value, v.unit, refs)
      if (problem) errors.push(`${at}: ${problem}`)
      if (!type && v.key === 'absent_features' && Array.isArray(v.value)) {
        const unknown = v.value.filter(
          (f) => f !== 'basement' && !ctx.types.has(f)
        )
        if (unknown.length)
          errors.push(`${at}: unknown component types ${unknown.join(', ')}`)
      }
    })
  }

  checkValues(input.houseValues, 'houseValues', null)

  const replacing = new Set<string>()
  input.components.forEach((c, i) => {
    const path = `components[${i}] ${c.type}`
    if (declared.has(c.ref)) errors.push(`${path}: ref ${c.ref} is used twice`)
    const libraryType = ctx.types.get(c.type)
    if (!libraryType) {
      errors.push(`${path}: unknown component type; pick one from type_library`)
    }
    if (c.parent) {
      const parentType = resolve(c.parent, `${path}.parent`)
      const allowed = parentType && ctx.types.get(parentType)
      if (allowed && !allowed.allowedSubcomponents.includes(c.type))
        errors.push(
          `${path}.parent: ${parentType} does not take ${c.type} as a subcomponent (allowed: ${allowed.allowedSubcomponents.join(', ') || 'none'})`
        )
    }
    if (c.replaces) {
      existing(c.replaces, `${path}.replaces`)
      if (replacing.has(c.replaces))
        errors.push(`${path}.replaces: ${c.replaces} is replaced twice`)
      replacing.add(c.replaces)
    }
    if (libraryType) checkValues(c.values, path, c.type)
    declared.set(c.ref, c.type)
  })

  input.componentValues.forEach((c, i) => {
    const path = `componentValues[${i}]`
    const type = existing(c.componentId, path)
    if (type) checkValues(c.values, path, type)
  })

  input.workItems.forEach((w, i) => {
    const path = `workItems[${i}]`
    if (w.component) resolve(w.component, `${path}.component`)
    if (w.documentId && !ctx.documents.has(w.documentId))
      errors.push(`${path}: no document ${w.documentId} saved for this house`)
    if (w.yearMin && w.yearMax && w.yearMin > w.yearMax)
      errors.push(`${path}: yearMin is after yearMax`)
    if (
      w.costLowSek !== undefined &&
      w.costHighSek !== undefined &&
      w.costLowSek > w.costHighSek
    )
      errors.push(`${path}: costLowSek exceeds costHighSek`)
  })

  const empty =
    !input.houseValues.length &&
    !input.components.length &&
    !input.componentValues.length &&
    !input.workItems.length
  if (empty) errors.push('nothing to propose')
  return { errors, warnings }
}
