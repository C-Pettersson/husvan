// Checks one observed value against the definition of its key (CLAUDE.md,
// "Konventioner"): an attribute in the type library or a key on the house.
// A key outside the schema is not checked; the schema says what to look for,
// not what may be stored.
import type { HouseKey } from './houseKeys'
import type { AttributeDefinition } from './schema'

export type ValueDefinition = {
  datatype: AttributeDefinition['datatype'] | HouseKey['datatype']
  unit?: string
  min?: number
  max?: number
  options?: string[]
}

export function fromAttribute(def: AttributeDefinition): ValueDefinition {
  return {
    datatype: def.datatype,
    unit: 'unit' in def ? def.unit : undefined,
    min: 'min' in def ? def.min : undefined,
    max: 'max' in def ? def.max : undefined,
    options: def.datatype === 'choice' ? Object.keys(def.options) : undefined,
  }
}

export function fromHouseKey(def: HouseKey): ValueDefinition {
  return { datatype: def.datatype, unit: def.unit, options: def.options }
}

// Ids a reference may point at: documents and components of the same house.
export type References = { documents: Set<string>; components: Set<string> }

// A real calendar day: 2026-02-30 parses but comes back as March.
export function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value
  )
}

export function checkValue(
  def: ValueDefinition,
  value: unknown,
  unit: string | undefined,
  refs: References,
  now = new Date()
): string | null {
  if (unit !== undefined && def.unit !== undefined && unit !== def.unit)
    return `unit must be ${def.unit}, convert the value first`

  switch (def.datatype) {
    case 'text':
    case 'actor':
      return typeof value === 'string' && value.trim()
        ? null
        : 'must be a non-empty string'
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value))
        return 'must be a number'
      if (def.min !== undefined && value < def.min)
        return `must be at least ${def.min}`
      if (def.max !== undefined && value > def.max)
        return `must be at most ${def.max}`
      return null
    case 'year': {
      const latest = now.getUTCFullYear() + 5
      return Number.isInteger(value) &&
        (value as number) >= 1600 &&
        (value as number) <= latest
        ? null
        : `must be a whole year between 1600 and ${latest}`
    }
    case 'date':
      return typeof value === 'string' && isIsoDate(value)
        ? null
        : 'must be an ISO date, e.g. 2026-10-22'
    case 'boolean':
      return typeof value === 'boolean' ? null : 'must be true or false'
    case 'choice':
      return typeof value === 'string' && def.options?.includes(value)
        ? null
        : `must be one of ${def.options?.join(', ')}`
    case 'list':
      return Array.isArray(value) &&
        value.every((v) => typeof v === 'string' && v)
        ? null
        : 'must be a list of strings'
    case 'document':
      return typeof value === 'string' && refs.documents.has(value)
        ? null
        : 'must be the id of a document saved for this house'
    case 'component':
      return typeof value === 'string' && refs.components.has(value)
        ? null
        : 'must be the id of an existing component of this house'
  }
}
