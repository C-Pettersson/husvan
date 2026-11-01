// The current value of a (component, key) among the observations a reader may
// see (CLAUDE.md, "Aktuellt värde"). The one place this rule lives; the web
// and the MCP tools both read through it.
import type { ValueSource } from '@prisma/client'

const SOURCE_RANK: Record<ValueSource, number> = {
  USER: 0,
  CLAUDE: 1,
  IMPORT: 2,
}

export type Candidate = {
  key: string
  source: ValueSource
  confidence: number | null
  recordedAt: Date
}

export type KeyValue<T> = { current: T; alternatives: T[] }

// USER before CLAUDE before IMPORT, then highest confidence (missing counts
// as lowest), then the latest. The caller has already left out retracted
// observations and those in changesets the reader may not see.
export function compareCandidates(a: Candidate, b: Candidate): number {
  return (
    SOURCE_RANK[a.source] - SOURCE_RANK[b.source] ||
    (b.confidence ?? -1) - (a.confidence ?? -1) ||
    b.recordedAt.getTime() - a.recordedAt.getTime()
  )
}

// One entry per key, in the order the keys first appear.
export function currentValues<T extends Candidate>(
  observations: T[]
): Map<string, KeyValue<T>> {
  const byKey = new Map<string, T[]>()
  for (const o of observations) {
    const list = byKey.get(o.key) ?? []
    list.push(o)
    byKey.set(o.key, list)
  }
  const result = new Map<string, KeyValue<T>>()
  for (const [key, list] of byKey) {
    const [current, ...alternatives] = [...list].sort(compareCandidates)
    result.set(key, { current, alternatives })
  }
  return result
}
