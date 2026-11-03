// How the seed treats a row that already exists (CLAUDE.md, "Leverans och
// drift"). Two modes:
// - full (`yarn db:seed`, run by hand): the repository's version of a row
//   wins, so corrected profile values reach the database; what was created
//   in operation and is not in the seed is kept.
// - add-only (`yarn db:seed:add`, run by the deploy Job): nothing that is
//   already stored changes. New types, profiles, attribute keys and
//   municipalities are added; existing values stay as they are.
export type SeedMode = 'full' | 'add_only'

type Json = Record<string, unknown>

export type StoredType = {
  label: Json
  category: string
  attributeSchema: Json
  allowedSubcomponents: string[]
  forecastDefaults: Json
}

// Two versions of one attribute definition: the winner's fields, and the
// choices of both, so that a new option in the repository (a greenhouse
// among the outbuildings) reaches a database whose attribute already
// exists, and an option added in operation survives a full seed.
function mergeAttribute(winner: unknown, loser: unknown): unknown {
  if (!isRecord(winner) || !isRecord(loser)) return winner ?? loser
  const options =
    isRecord(winner.options) || isRecord(loser.options)
      ? {
          ...(isRecord(loser.options) ? loser.options : {}),
          ...(isRecord(winner.options) ? winner.options : {}),
        }
      : undefined
  return { ...loser, ...winner, ...(options && { options }) }
}

const isRecord = (v: unknown): v is Json =>
  !!v && typeof v === 'object' && !Array.isArray(v)

function mergeAttributes(winner: Json, loser: Json): Json {
  const out: Json = { ...loser }
  for (const [key, def] of Object.entries(winner))
    out[key] = mergeAttribute(def, loser[key])
  return out
}

// A component type merged with what is stored: attribute keys and forecast
// defaults are merged key by key, the choices of an attribute too, and
// allowed subcomponents are the union.
export function mergeType(
  seed: StoredType,
  existing: StoredType | null,
  mode: SeedMode
): StoredType {
  if (!existing) return seed
  const keep = mode === 'add_only'
  return {
    label: keep ? existing.label : seed.label,
    category: keep ? existing.category : seed.category,
    attributeSchema: keep
      ? mergeAttributes(existing.attributeSchema, seed.attributeSchema)
      : mergeAttributes(seed.attributeSchema, existing.attributeSchema),
    allowedSubcomponents: [
      ...new Set([
        ...existing.allowedSubcomponents,
        ...seed.allowedSubcomponents,
      ]),
    ],
    forecastDefaults: keep
      ? { ...seed.forecastDefaults, ...existing.forecastDefaults }
      : { ...existing.forecastDefaults, ...seed.forecastDefaults },
  }
}

// Whether an existing row would change under the full seed: said in the
// add-only log, so that the owner knows a seed by hand has something to do.
export function differs(seed: unknown, existing: unknown): boolean {
  return canonical(seed) !== canonical(existing)
}

// JSON with object keys sorted and absent keys dropped, so that key order,
// null against undefined (an optional seed field against a nullable column)
// and Decimal wrappers do not count as changes.
export function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const decimal = value as { toNumber?: () => number }
    if (typeof decimal.toNumber === 'function') return decimal.toNumber()
    return Object.fromEntries(
      Object.keys(value as Json)
        .filter((k) => (value as Json)[k] != null)
        .sort()
        .map((k) => [k, sortKeys((value as Json)[k])])
    )
  }
  return value
}

// The stored row's columns that the seed defines, for comparing the two.
export function pick<T extends object>(row: T, keys: string[]): Partial<T> {
  return Object.fromEntries(
    keys.filter((k) => k in row).map((k) => [k, row[k as keyof T]])
  ) as Partial<T>
}
