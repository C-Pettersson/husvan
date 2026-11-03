// A scenario tried without writing anything (CLAUDE.md, "Tänk om"): values
// set on the house or a part, and parts left out, applied to the house as
// read before it is analysed. The forecast and compare tools take one, and
// the open questions try each answer the same way. Pure.
import { z } from 'zod'
import { flatten } from '@/server/houses/derive'
import type { ComponentView, KeyValueView } from '@/server/houses/getHouse'
import { ASSUMED_PREFIX } from './plan'

export type Answer = string | number | boolean

export const whatIfInput = z.object({
  values: z
    .array(
      z.object({
        componentId: z
          .string()
          .nullish()
          .describe(
            'A component id from get_house; assumed:<type> for a part the documents do not mention, which is then tried as one with only this value; omitted or null for the house itself.'
          ),
        key: z.string().regex(/^[a-z][a-z0-9_]*$/),
        value: z.union([z.string(), z.number(), z.boolean()]),
      })
    )
    .max(50)
    .optional()
    .describe('Values tried in place of the current ones, as the user’s own.'),
  excludeComponentIds: z
    .array(z.string())
    .max(50)
    .optional()
    .describe(
      'Components left out, with their subcomponents, as if the documents did not mention them; a part every house has is then assumed instead.'
    ),
})
export type WhatIf = z.infer<typeof whatIfInput>

// A value as the user's own answer, with full confidence.
export const answered = (key: string, value: Answer): KeyValueView => ({
  key,
  current: {
    id: 'answer',
    key,
    value,
    unit: null,
    source: 'USER',
    confidence: 1,
    quote: null,
    documentId: null,
    recordedAt: new Date(0),
    draft: false,
  },
  alternatives: [],
})

export const withValue = (
  values: KeyValueView[],
  key: string,
  value: Answer
) => [...values.filter((v) => v.key !== key), answered(key, value)]

// The house with one answer given about a part. A part the documents do
// not mention becomes one with only that value, still marked assumed, so
// that nothing else about it changes.
export function withAnswer(
  components: ComponentView[],
  target: { componentId: string; type: string },
  key: string,
  value: Answer
): ComponentView[] {
  if (target.componentId.startsWith(ASSUMED_PREFIX)) {
    const existing = flatten(components).find(
      (c) => c.id === target.componentId
    )
    if (!existing)
      return [
        ...components,
        {
          id: target.componentId,
          type: target.type,
          name: null,
          draft: false,
          values: [answered(key, value)],
          children: [],
        },
      ]
  }
  const set = (list: ComponentView[]): ComponentView[] =>
    list.map((c) =>
      c.id === target.componentId
        ? { ...c, values: withValue(c.values, key, value) }
        : { ...c, children: set(c.children) }
    )
  return set(components)
}

const without = (list: ComponentView[], ids: Set<string>): ComponentView[] =>
  list
    .filter((c) => !ids.has(c.id))
    .map((c) => ({ ...c, children: without(c.children, ids) }))

export type WhatIfApplied = {
  components: ComponentView[]
  houseValues: KeyValueView[]
  // Ids the house does not have; nothing is applied when there are any.
  problems: string[]
}

export function applyWhatIf(
  components: ComponentView[],
  houseValues: KeyValueView[],
  whatIf: WhatIf | undefined
): WhatIfApplied {
  if (!whatIf) return { components, houseValues, problems: [] }
  const problems: string[] = []
  const known = new Set(flatten(components).map((c) => c.id))
  const excluded = new Set(whatIf.excludeComponentIds ?? [])
  for (const id of excluded)
    if (!known.has(id)) problems.push(`No component ${id} in the house.`)
  let list = without(components, excluded)
  // What is left after the exclusions, subcomponents included.
  const remaining = new Set(flatten(list).map((c) => c.id))
  let values = houseValues
  for (const v of whatIf.values ?? []) {
    const id = v.componentId ?? null
    if (id === null) {
      values = withValue(values, v.key, v.value)
    } else if (id.startsWith(ASSUMED_PREFIX)) {
      list = withAnswer(
        list,
        { componentId: id, type: id.slice(ASSUMED_PREFIX.length) },
        v.key,
        v.value
      )
    } else if (!remaining.has(id)) {
      problems.push(`No component ${id} in the house.`)
    } else {
      list = withAnswer(list, { componentId: id, type: '' }, v.key, v.value)
    }
  }
  return problems.length
    ? { components, houseValues, problems }
    : { components: list, houseValues: values, problems }
}
