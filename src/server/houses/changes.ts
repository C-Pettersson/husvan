// What a draft may contain and how it is checked against the type library
// before anything is written (CLAUDE.md, "Skrivflöde": drafts are validated
// at propose_changes, so Claude gets the error while it has the document in
// front of it). Shared by create_house, propose_changes and add_work_item.
import { z } from 'zod'
import {
  checkValue,
  fromAttribute,
  fromHouseKey,
  normalizeValue,
  type References,
} from '@/server/library/checkValue'
import { HOUSE_KEYS } from '@/server/library/houseKeys'
import { keySchema, type AttributeDefinition } from '@/server/library/schema'

export const valueInput = z.object({
  key: keySchema,
  value: z
    .union([
      z.string().max(5000),
      z.number(),
      z.boolean(),
      z.array(z.string().max(200)).max(100),
    ])
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
  documentId: z
    .uuid()
    .optional()
    .describe(
      'The saved document that mentions the part itself, for a part registered without values of its own.'
    ),
  quote: z
    .string()
    .max(2000)
    .optional()
    .describe('The passage that mentions the part, verbatim.'),
  values: z.array(valueInput).default([]),
})

export const componentValuesInput = z.object({
  componentId: z.uuid().describe('An existing component of the house.'),
  values: z.array(valueInput).min(1),
})

export const workItemInput = z.object({
  replaces: z
    .uuid()
    .optional()
    .describe(
      'Id of an existing work item this one restates, e.g. with a cost estimate or better years. The old one stays as history and is no longer counted. Restate the description, kind and years; the component is taken from the old item unless given.'
    ),
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
  severity: z
    .enum(['MINOR', 'RISK', 'DEFECT', 'SEVERE'])
    .optional()
    .describe(
      'How serious the protocol judges it, in its own terms. MINOR: mindre brist, a note or general information (e.g. Anticimex’s blue mark: no further investigation needed). RISK: a risk in the risk analysis (riskanalys, risk för fel/skada). DEFECT: a defect or damage that should be fixed. SEVERE: a serious defect, acute damage or something to fix at once. A recommended further investigation (fördjupad undersökning, fortsatt teknisk utredning) is kind INVESTIGATION with the severity of what it is about. Without years the forecast times the item by severity, so set it for every finding from a protocol.'
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
  confidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe(
      'How sure the reading of the finding is, 0 to 1, as for a value; set it below 0.7 when the severity is your interpretation rather than the protocol’s words.'
    ),
  documentId: z.uuid().optional(),
  quote: z.string().max(2000).optional(),
})

export type WorkItemInput = z.infer<typeof workItemInput>

// Corrections of approved rows (CLAUDE.md, "Rättningar"). Each becomes a
// row in the draft: a component that corrects the old one (a moved, renamed
// or retyped part), or a retraction of a value. The old rows are never
// touched; once the draft is approved the new row stands for the part and
// the retired value is hidden.
export const moveComponentInput = z.object({
  componentId: z.uuid().describe('An approved component of the house.'),
  newParent: z
    .uuid()
    .nullable()
    .describe(
      'Id of the new parent, or null for the top level. The parent type must allow the component’s type as a subcomponent.'
    ),
})
export const renameComponentInput = z.object({
  componentId: z.uuid(),
  name: z.string().min(1).max(200).describe('The new Swedish name.'),
})
export const retypeComponentInput = z.object({
  componentId: z.uuid(),
  newType: keySchema.describe(
    'The type the part should have had, e.g. wc for a bathroom without a shower. For a part that was physically replaced, use a new component with replaces instead.'
  ),
  reason: z.string().max(500).optional(),
})
export const retireValueInput = z.object({
  valueId: z
    .uuid()
    .describe(
      'Id of an approved value, current or alternative, from get_house.'
    ),
  reason: z.string().min(1).max(500).describe('Why the value is wrong.'),
})

export const changesShape = {
  houseValues: z
    .array(valueInput)
    .max(200)
    .default([])
    .describe(
      'Values about the house itself; the keys are in type_library under houseKeys.'
    ),
  components: z.array(componentInput).max(300).default([]),
  componentValues: z
    .array(componentValuesInput)
    .max(300)
    .default([])
    .describe('New values for components that already exist.'),
  workItems: z.array(workItemInput).max(200).default([]),
  moveComponents: z
    .array(moveComponentInput)
    .default([])
    .describe('Approved components to move under another parent.'),
  renameComponents: z
    .array(renameComponentInput)
    .default([])
    .describe('Approved components to rename.'),
  retypeComponents: z
    .array(retypeComponentInput)
    .default([])
    .describe(
      'Approved components registered with the wrong type. Values stay with the part; those outside the new type’s attributes are listed in the answer.'
    ),
  retireValues: z
    .array(retireValueInput)
    .default([])
    .describe(
      'Approved values to retire. Hidden once the draft is approved; the row stays as history.'
    ),
}

export const changesInput = z.object(changesShape)
export type ChangesInput = z.infer<typeof changesInput>

export const emptyChanges: ChangesInput = {
  houseValues: [],
  components: [],
  componentValues: [],
  workItems: [],
  moveComponents: [],
  renameComponents: [],
  retypeComponents: [],
  retireValues: [],
}

export const isEmpty = (input: ChangesInput) =>
  !input.houseValues.length &&
  !input.components.length &&
  !input.componentValues.length &&
  !input.workItems.length &&
  !input.moveComponents.length &&
  !input.renameComponents.length &&
  !input.retypeComponents.length &&
  !input.retireValues.length

// The one correction row a draft writes for a component: what moves,
// renames and retypes of the same component in one call add up to.
export type Correction = {
  componentId: string
  newParent?: string | null
  name?: string
  newType?: string
  reason?: string
}

export function corrections(input: ChangesInput): Correction[] {
  const map = new Map<string, Correction>()
  const of = (id: string) => {
    const c = map.get(id) ?? { componentId: id }
    map.set(id, c)
    return c
  }
  for (const m of input.moveComponents)
    of(m.componentId).newParent = m.newParent
  for (const r of input.renameComponents) of(r.componentId).name = r.name
  for (const r of input.retypeComponents) {
    const c = of(r.componentId)
    c.newType = r.newType
    if (r.reason) c.reason = r.reason
  }
  return [...map.values()]
}

export type LibraryType = {
  attributeSchema: Record<string, AttributeDefinition>
  allowedSubcomponents: string[]
}

// What a draft may point at. components holds the house's current
// components (approved, or in the draft being added to), id to type;
// replaced holds those another visible component has replaced. workItems
// and replacedWorkItems do the same for work items, id to component id.
// pendingReplacements holds components and work items another open draft
// replaces, id to that draft, so approving both cannot count one twice.
export type ChangeContext = {
  types: Map<string, LibraryType>
  components: Map<string, string>
  replaced: Set<string>
  documents: Set<string>
  workItems: Map<string, string | null>
  replacedWorkItems: Set<string>
  pendingReplacements: Map<string, string>
  // For corrections: each visible component's parent, the rows that are in
  // the draft itself (corrected with edit_draft, not here), the ids another
  // open draft already corrects, the approved values that may be retired
  // (id to component and key) and the ids another open draft retires.
  parents?: Map<string, string | null>
  draftComponents?: Set<string>
  pendingCorrections?: Map<string, string>
  values?: Map<string, { componentId: string | null; key: string }>
  pendingRetirements?: Map<string, string>
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
      // An approximate year ("1999-2004") is stored as one year with a
      // lower confidence; the row is changed in place so the write sees it.
      else Object.assign(v, normalizeValue(def, v) ?? {})
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
    if (c.documentId && !ctx.documents.has(c.documentId))
      errors.push(
        `${path}.documentId: no document ${c.documentId} on this house`
      )
    if (libraryType) checkValues(c.values, path, c.type)
    declared.set(c.ref, c.type)
  })

  input.componentValues.forEach((c, i) => {
    const path = `componentValues[${i}]`
    const type = existing(c.componentId, path)
    if (type) checkValues(c.values, path, type)
  })

  const restating = new Set<string>()
  input.workItems.forEach((w, i) => {
    const path = `workItems[${i}]`
    if (w.replaces) {
      const at = `${path}.replaces`
      if (ctx.replacedWorkItems.has(w.replaces))
        errors.push(`${at}: work item ${w.replaces} has been replaced`)
      else if (!ctx.workItems.has(w.replaces))
        errors.push(
          `${at}: no work item ${w.replaces} in this house; use get_house`
        )
      if (restating.has(w.replaces))
        errors.push(`${at}: ${w.replaces} is replaced twice`)
      restating.add(w.replaces)
    }
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

  for (const id of [...replacing, ...restating]) {
    const draft = ctx.pendingReplacements.get(id)
    if (draft)
      errors.push(
        `${id} is already replaced in open draft ${draft}; add to that draft with draftId, or let the user decide it first`
      )
  }

  validateCorrections(input, ctx, errors, warnings)

  if (isEmpty(input)) errors.push('nothing to propose')
  return { errors, warnings }
}

// Moves, renames, retypes and retirements of approved rows.
function validateCorrections(
  input: ChangesInput,
  ctx: ChangeContext,
  errors: string[],
  warnings: string[]
) {
  const parents = ctx.parents ?? new Map<string, string | null>()
  const draftRows = ctx.draftComponents ?? new Set<string>()
  const pending = ctx.pendingCorrections ?? new Map<string, string>()
  // The approved component a correction may name.
  const target = (id: string, path: string) => {
    if (ctx.replaced.has(id)) {
      errors.push(`${path}: component ${id} has been replaced`)
      return undefined
    }
    const type = ctx.components.get(id)
    if (!type) {
      errors.push(`${path}: no component ${id} in this house; use get_house`)
      return undefined
    }
    if (draftRows.has(id)) {
      errors.push(
        `${path}: component ${id} is a row of this draft; correct it with edit_draft`
      )
      return undefined
    }
    const draft = pending.get(id)
    if (draft)
      errors.push(
        `${path}: component ${id} is already corrected in open draft ${draft}; add to that draft with draftId, or let the user decide it first`
      )
    return type
  }
  const all = corrections(input)
  // Where each part is after the moves of this call.
  const moved = new Map(
    all
      .filter((c) => c.newParent !== undefined)
      .map((c) => [c.componentId, c.newParent as string | null])
  )
  const parentOf = (id: string) =>
    moved.has(id) ? moved.get(id)! : (parents.get(id) ?? null)
  const childrenOf = (id: string) =>
    [...parents.keys()].filter((child) => parentOf(child) === id)

  for (const c of all) {
    const path = `corrections ${c.componentId}`
    const type = target(c.componentId, path)
    if (!type) continue
    const finalType = c.newType ?? type
    if (c.newType !== undefined) {
      const lib = ctx.types.get(c.newType)
      if (!lib) {
        errors.push(
          `${path}.newType: unknown component type ${c.newType}; pick one from type_library`
        )
      } else {
        if (c.newType === type)
          errors.push(`${path}.newType: the component already has type ${type}`)
        const kept = childrenOf(c.componentId).filter(
          (child) =>
            !lib.allowedSubcomponents.includes(ctx.components.get(child)!)
        )
        if (kept.length)
          errors.push(
            `${path}.newType: ${c.newType} does not take the subcomponents ${kept.join(', ')}; move them first`
          )
        const keys = [...(ctx.values ?? [])]
          .filter(([, v]) => v.componentId === c.componentId)
          .map(([, v]) => v.key)
        const outside = [...new Set(keys)].filter(
          (k) => !lib.attributeSchema[k]
        )
        if (outside.length)
          warnings.push(
            `${path}: values ${outside.join(', ')} are outside ${c.newType}’s attributes and stay with the part; retire them if they no longer apply`
          )
      }
    }
    if (c.newParent !== undefined) {
      const at = `${path}.newParent`
      if (c.newParent === c.componentId)
        errors.push(`${at}: a component cannot be its own parent`)
      else if (c.newParent !== null) {
        const parentType = target(c.newParent, at)
        // Walk up from the new parent; reaching the part itself is a cycle,
        // and so is a loop among the moves of this call.
        const seen = new Set<string>()
        let up: string | null | undefined = c.newParent
        while (up && !seen.has(up)) {
          if (up === c.componentId) {
            errors.push(`${at}: ${c.newParent} is below ${c.componentId}`)
            break
          }
          seen.add(up)
          up = parentOf(up)
        }
        if (up && seen.has(up))
          errors.push(`${at}: the moves in this call form a cycle`)
        const allowed = parentType && ctx.types.get(parentType)
        if (allowed && !allowed.allowedSubcomponents.includes(finalType))
          errors.push(
            `${at}: ${parentType} does not take ${finalType} as a subcomponent (allowed: ${allowed.allowedSubcomponents.join(', ') || 'none'})`
          )
      } else if (ctx.types.get(finalType) === undefined) {
        // unknown type reported above
      }
    } else if (c.newType !== undefined && ctx.types.get(c.newType)) {
      // A retyped part stays where it is; its parent must take the new type.
      const parent = parents.get(c.componentId)
      const parentType = parent ? ctx.components.get(parent) : undefined
      const allowed = parentType && ctx.types.get(parentType)
      if (allowed && !allowed.allowedSubcomponents.includes(finalType))
        errors.push(
          `${path}.newType: the parent ${parentType} does not take ${finalType} as a subcomponent; move it as well`
        )
    }
  }

  const retiring = new Set<string>()
  input.retireValues.forEach((r, i) => {
    const path = `retireValues[${i}]`
    const value = ctx.values?.get(r.valueId)
    if (!value)
      errors.push(
        `${path}: no approved value ${r.valueId} in this house; get_house gives each value its id`
      )
    if (retiring.has(r.valueId))
      errors.push(`${path}: ${r.valueId} is retired twice`)
    retiring.add(r.valueId)
    const draft = ctx.pendingRetirements?.get(r.valueId)
    if (draft)
      errors.push(
        `${path}: ${r.valueId} is already retired in open draft ${draft}`
      )
  })
}

// Correcting an open draft row by row (CLAUDE.md, "Rätta ett utkast"). Rows
// that should not be approved are left out: moved to a REJECTED changeset
// of their own, so that every read hides them the way it hides any
// rejected row. A value is corrected by leaving the wrong one out and
// adding the right one in the same call; a new value alone wins only when
// its confidence is at least the old one's (see currentValue.ts).
export const draftEditShape = {
  removeComponents: z
    .array(z.uuid())
    .default([])
    .describe(
      'Ids of components in the draft that should not be added, e.g. a WC registered as a full bathroom. Their subcomponents, values and work items in the draft go with them.'
    ),
  removeValues: z
    .array(z.uuid())
    .default([])
    .describe(
      'Ids of values in the draft that are wrong; get_house with draftId gives each draft value its id. Give the right value in the same call.'
    ),
  removeWorkItems: z
    .array(z.uuid())
    .default([])
    .describe('Ids of work items in the draft that should not be added.'),
  removeRetirements: z
    .array(z.uuid())
    .default([])
    .describe(
      'Ids of retirements in the draft (get_house with draftId lists them) that should not take effect.'
    ),
}

export const draftEditInput = z.object(draftEditShape)
export type DraftEditInput = z.infer<typeof draftEditInput>

// The rows of the draft being edited.
export type DraftRows = {
  components: { id: string; parentId: string | null }[]
  observations: { id: string; componentId: string | null }[]
  workItems: { id: string; componentId: string | null }[]
  retractions?: { id: string }[]
}

// What leaves the draft: the rows named, the subcomponents of a removed
// component, and the values and work items on any of those.
export type DraftRemoval = {
  components: string[]
  observations: string[]
  workItems: string[]
  retractions: string[]
}

export function validateDraftEdit(
  edit: DraftEditInput,
  changes: ChangesInput,
  rows: DraftRows
): { errors: string[]; remove: DraftRemoval } {
  const errors: string[] = []
  const inDraft = (
    ids: string[],
    known: { id: string }[],
    path: string,
    what: string
  ) => {
    const have = new Set(known.map((r) => r.id))
    ids.forEach((id, i) => {
      if (!have.has(id))
        errors.push(`${path}[${i}]: no ${what} ${id} in this draft`)
    })
    return new Set(ids.filter((id) => have.has(id)))
  }
  const components = inDraft(
    edit.removeComponents,
    rows.components,
    'removeComponents',
    'component'
  )
  for (let grew = true; grew;) {
    grew = false
    for (const c of rows.components)
      if (c.parentId && components.has(c.parentId) && !components.has(c.id)) {
        components.add(c.id)
        grew = true
      }
  }
  const onRemoved = (r: { componentId: string | null }) =>
    r.componentId !== null && components.has(r.componentId)
  const observations = inDraft(
    edit.removeValues,
    rows.observations,
    'removeValues',
    'value'
  )
  for (const o of rows.observations.filter(onRemoved)) observations.add(o.id)
  const workItems = inDraft(
    edit.removeWorkItems,
    rows.workItems,
    'removeWorkItems',
    'work item'
  )
  for (const w of rows.workItems.filter(onRemoved)) workItems.add(w.id)
  const retractions = inDraft(
    edit.removeRetirements,
    rows.retractions ?? [],
    'removeRetirements',
    'retirement'
  )

  // Additions may not build on what this call removes.
  const removedTarget = (target: string | undefined, path: string) => {
    if (target && components.has(target))
      errors.push(`${path}: component ${target} is removed in this call`)
  }
  changes.components.forEach((c, i) => {
    removedTarget(c.parent, `components[${i}].parent`)
    removedTarget(c.replaces, `components[${i}].replaces`)
  })
  changes.componentValues.forEach((c, i) =>
    removedTarget(c.componentId, `componentValues[${i}]`)
  )
  changes.workItems.forEach((w, i) =>
    removedTarget(w.component, `workItems[${i}].component`)
  )

  const nothingRemoved =
    !components.size &&
    !observations.size &&
    !workItems.size &&
    !retractions.size
  if (nothingRemoved && isEmpty(changes)) errors.push('nothing to change')
  return {
    errors,
    remove: {
      components: [...components],
      observations: [...observations],
      workItems: [...workItems],
      retractions: [...retractions],
    },
  }
}
