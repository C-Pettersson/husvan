// Which component rows stand for the house as it is (CLAUDE.md,
// "Rättningar"): a replacement hides the part it replaced, a correction
// hides the row it corrects, and the values, work items and subcomponents of
// a corrected row belong to the newest row of its chain. Pure, so that the
// rule is tested apart from the database; getHouse feeds it the rows a
// reader may see.

export type ChainRow = {
  id: string
  parentId: string | null
  replacesId: string | null
  correctsId: string | null
}

export type Chains<T extends ChainRow> = {
  // The rows that stand for a part now: neither corrected nor replaced,
  // in the order given.
  heads: T[]
  // Every row of a visible chain to its head's id; the parent of a child
  // that still points at a corrected row is found through it.
  headOf: Map<string, string>
  // Head id to its chain, newest first: the head, the row it corrects, ...
  chainOf: Map<string, T[]>
}

export function resolveChains<T extends ChainRow>(rows: T[]): Chains<T> {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const corrected = new Set(
    rows.flatMap((r) => (r.correctsId ? [r.correctsId] : []))
  )
  const replaced = new Set(
    rows.flatMap((r) => (r.replacesId ? [r.replacesId] : []))
  )
  const heads: T[] = []
  const headOf = new Map<string, string>()
  const chainOf = new Map<string, T[]>()
  for (const row of rows) {
    if (corrected.has(row.id)) continue
    const chain: T[] = []
    const seen = new Set<string>()
    for (
      let r: T | undefined = row;
      r && !seen.has(r.id);
      r = r.correctsId ? byId.get(r.correctsId) : undefined
    ) {
      seen.add(r.id)
      chain.push(r)
    }
    // A part replaced at any point of its registration is history.
    if (chain.some((r) => replaced.has(r.id))) continue
    heads.push(row)
    chainOf.set(row.id, chain)
    for (const r of chain) headOf.set(r.id, row.id)
  }
  return { heads, headOf, chainOf }
}
