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

// An approximate year, as a document gives it: a span ("1999-2004",
// "1999–2004", {from: 1999, to: 2004}) or an upper bound ("before 2006",
// "äldre än 20 år" said as before the year 20 years back). Stored as one
// year with a lower confidence (normalizeValue), since the forecast reads a
// year.
export type ApproximateYear = { from: number; to: number; text: string }

// How many years back an upper bound alone is taken to reach: "before
// 2006" is read as 1996 to 2006.
export const BEFORE_SPAN_YEARS = 20

// A span of years is sure of the span, not the year: at most this
// confidence (CLAUDE.md, "Öppna frågor" stores a span the same way).
export const APPROXIMATE_CONFIDENCE = 0.7

export function parseApproximateYear(value: unknown): ApproximateYear | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const { from, to } = value as { from?: unknown; to?: unknown }
    if (typeof from === 'number' && typeof to === 'number')
      return { from, to, text: JSON.stringify({ from, to }) }
    return null
  }
  if (typeof value !== 'string') return null
  const text = value.trim()
  const span = /^(\d{4})\s*(?:-|–|—|to|till)\s*(\d{4})$/i.exec(text)
  if (span) return { from: Number(span[1]), to: Number(span[2]), text }
  const before = /^(?:before|före|senast|<)\s*(\d{4})$/i.exec(text)
  if (before) {
    const to = Number(before[1])
    return { from: to - BEFORE_SPAN_YEARS, to, text }
  }
  return null
}

// What is stored for a value Claude gave approximately: the middle year,
// the confidence capped, and the original as the quote when there is none.
// null when the value is stored as given.
export function normalizeValue(
  def: ValueDefinition,
  v: { value: unknown; confidence: number; quote?: string }
): { value: number; confidence: number; quote?: string } | null {
  if (def.datatype !== 'year') return null
  const approximate = parseApproximateYear(v.value)
  if (!approximate) return null
  return {
    value: Math.round((approximate.from + approximate.to) / 2),
    confidence: Math.min(v.confidence, APPROXIMATE_CONFIDENCE),
    quote: v.quote ?? approximate.text,
  }
}

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
      const whole = (y: unknown) =>
        Number.isInteger(y) && (y as number) >= 1600 && (y as number) <= latest
      const approximate = parseApproximateYear(value)
      if (approximate) {
        if (!whole(approximate.from) || !whole(approximate.to))
          return `must be whole years between 1600 and ${latest}`
        return approximate.from <= approximate.to
          ? null
          : 'the range must run from the earlier year to the later'
      }
      return whole(value)
        ? null
        : `must be a whole year between 1600 and ${latest}, a range such as "1999-2004" or {from, to}, or "before 2006"`
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
