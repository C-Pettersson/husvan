// The forecast items that differ most across houses (CLAUDE.md, "Ojämn
// redovisning"): per house the typical total and what it rests on, so that
// 0 kr from the documents is told from 0 kr because nothing is known.
// Unknown is null and left out of the spread. Pure; compareHouses feeds it.
import type { ForecastItem } from './forecast'
import type { ComponentPlan, PlanBasis } from './plan'
import { ENERGY_KEYS, OPERATING_TOTAL_KEYS, type RunningBasis } from './running'

// What a cell rests on. Parts: the plan's basis, or the documents do not
// mention the type (not_documented, null), or they say the house has none
// (absent, 0). Running costs: the line's basis, or the figure is inside the
// listing's total, or nothing is known. Work items: whether there is an
// inspection protocol; without one the defects are unknown.
export type CellBasis =
  | PlanBasis
  | 'not_documented'
  | 'absent'
  | RunningBasis
  | 'in_operating_total'
  | 'unknown'
  | 'inspected'
  | 'not_inspected'

export type DifferenceHouse = {
  items: ForecastItem[]
  plans: ComponentPlan[]
  // Types the house is known not to have (absent_features).
  absent: string[]
  inspected: boolean
  runningCostsKnown: boolean
}

export type Difference = {
  item: string
  sek: (number | null)[]
  basis: CellBasis[]
  spread: number
}

// Heating and household electricity as one line, since an electrically
// heated house has its heating on the electricity bill.
export const ENERGY_ITEM = 'running:energy'

// Weakest first, so that one part without a year marks the type.
const PLAN_ORDER: PlanBasis[] = [
  'unknown_year',
  'assumed',
  'construction_year',
  'documented',
]
const RUNNING_ORDER: RunningBasis[] = ['estimated', 'from_energy', 'stated']

const weakest = <T extends string>(order: T[], list: T[]): T =>
  order.find((b) => list.includes(b)) ?? order[order.length - 1]

const rowKey = (i: ForecastItem) =>
  i.category === 'running' && ENERGY_KEYS.includes(i.key)
    ? ENERGY_ITEM
    : `${i.category}:${i.key}`

export function forecastDifferences(
  houses: DifferenceHouse[],
  limit = 8
): Difference[] {
  const rows = new Set<string>()
  const byHouse = houses.map((h) => {
    const sums = new Map<string, { sek: number; items: ForecastItem[] }>()
    for (const item of h.items) {
      const key = rowKey(item)
      const row = sums.get(key) ?? { sek: 0, items: [] }
      row.sek += item.total.typical
      row.items.push(item)
      sums.set(key, row)
      rows.add(key)
    }
    return sums
  })

  const cell = (
    h: DifferenceHouse,
    sums: (typeof byHouse)[number],
    key: string
  ): { sek: number | null; basis: CellBasis } => {
    const [category, type] = key.split(':')
    const row = sums.get(key)
    if (category === 'running') {
      if (!h.runningCostsKnown) return { sek: null, basis: 'unknown' }
      if (row)
        return {
          sek: row.sek,
          basis: weakest(
            RUNNING_ORDER,
            row.items.map((i) => i.basis as RunningBasis)
          ),
        }
      const inTotal = h.items.some(
        (i) => i.category === 'running' && OPERATING_TOTAL_KEYS.includes(i.key)
      )
      return { sek: null, basis: inTotal ? 'in_operating_total' : 'unknown' }
    }
    if (category === 'work_item') {
      const sek = row?.sek ?? 0
      return h.inspected
        ? { sek, basis: 'inspected' }
        : { sek: sek > 0 ? sek : null, basis: 'not_inspected' }
    }
    if (category === 'capital') return { sek: row?.sek ?? 0, basis: 'stated' }
    const plans = h.plans.filter((p) => p.type === type)
    if (!plans.length)
      return h.absent.includes(type)
        ? { sek: 0, basis: 'absent' }
        : { sek: null, basis: 'not_documented' }
    return {
      sek: row?.sek ?? 0,
      basis: weakest(
        PLAN_ORDER,
        plans.map((p) => p.basis)
      ),
    }
  }

  return [...rows]
    .map((item) => {
      const cells = houses.map((h, i) => cell(h, byHouse[i], item))
      const known = cells
        .map((c) => c.sek)
        .filter((v): v is number => v !== null)
      return {
        item,
        sek: cells.map((c) => c.sek),
        basis: cells.map((c) => c.basis),
        spread: known.length ? Math.max(...known) - Math.min(...known) : NaN,
      }
    })
    .filter((d) => Number.isFinite(d.spread))
    .sort((x, y) => y.spread - x.spread)
    .slice(0, limit)
}
