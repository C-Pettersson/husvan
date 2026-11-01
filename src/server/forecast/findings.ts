// Inspection findings side by side. A house with an inspection protocol
// lists its defects; one without has unknown defects, not none. Comparing
// them as they are would favour the house that discloses less, so a house
// without a protocol gets null instead of zero.
import { workItemCost, type WorkItemInput } from './forecast'

export type FindingsHouse = {
  inspected: boolean
  workItems: WorkItemInput[]
  // Component type per component id, for the work items' components.
  typeOf: Map<string, string>
}

export type FindingsRow = {
  // Component type, or 'house' for findings on no component.
  type: string
  perHouse: ({ items: number; typicalSek: number; unpriced: number } | null)[]
}

export function findingsByType(houses: FindingsHouse[]): FindingsRow[] {
  const rows = new Map<string, FindingsRow['perHouse']>()
  const empty = () =>
    houses.map((h) =>
      h.inspected ? { items: 0, typicalSek: 0, unpriced: 0 } : null
    )
  houses.forEach((h, i) => {
    for (const w of h.workItems) {
      const type = (w.componentId && h.typeOf.get(w.componentId)) || 'house'
      const row = rows.get(type) ?? empty()
      // Findings from a house without a protocol, such as the listing's,
      // still count for that house.
      const cell = row[i] ?? { items: 0, typicalSek: 0, unpriced: 0 }
      const cost = workItemCost(w)
      cell.items += 1
      if (cost) cell.typicalSek += cost.typical
      else cell.unpriced += 1
      row[i] = cell
      rows.set(type, row)
    }
  })
  return [...rows].map(([type, perHouse]) => ({ type, perHouse }))
}
