// Maintenance debt and maintenance-adjusted price (CLAUDE.md,
// "Underhållsskuld och underhållsjusterat pris"): how much of each part's
// replacement and repaint has been used up, plus the work items, in
// start-year kronor. Independent of the horizon, so a roof due in year 16
// still counts.
import {
  byScenario,
  type ByScenario,
  type ComponentPlan,
  type Scenario,
} from './plan'
import {
  renewsCheaper,
  replacementItems,
  workItemCost,
  type WorkItemInput,
} from './forecast'

export type DebtPart = {
  type: string // component type, or 'work_items' for items on no component
  componentId?: string
  workItemId?: string
  kind: 'replacement' | 'repaint' | 'work_item'
  sek: ByScenario
}

export type Debt = { total: ByScenario; parts: DebtPart[] }

const used = (age: number, life: number) =>
  life > 0 ? Math.min(1, Math.max(0, age) / life) : 1

export function maintenanceDebt(
  plans: ComponentPlan[],
  workItems: WorkItemInput[],
  startYear: number
): Debt {
  const parts: DebtPart[] = []
  const forcedBy = replacementItems(workItems)
  const typeOf = new Map(plans.map((p) => [p.componentId, p.type]))

  for (const plan of plans) {
    const w = forcedBy.get(plan.componentId)
    const itemCost = w && workItemCost(w)
    // A replacement work item takes the place of the component's term.
    if (w && (itemCost || plan.cost)) {
      parts.push({
        type: plan.type,
        componentId: plan.componentId,
        workItemId: w.id,
        kind: 'replacement',
        sek: itemCost ?? plan.cost!,
      })
    } else if (plan.cost) {
      // What it costs to renew the part in that scenario, the cheaper way
      // where it can be.
      const cost = byScenario((s: Scenario) =>
        renewsCheaper(plan, s) ? plan.renewal!.cost[s] : plan.cost![s]
      )
      parts.push({
        type: plan.type,
        componentId: plan.componentId,
        kind: 'replacement',
        sek: byScenario((s: Scenario) =>
          plan.soon
            ? cost[s]
            : cost[s] * used(startYear - plan.installYear[s], plan.lifespan[s])
        ),
      })
    }
    if (plan.repaint) {
      const { cost, lastPainted, interval } = plan.repaint
      parts.push({
        type: plan.type,
        componentId: plan.componentId,
        kind: 'repaint',
        sek: byScenario(
          (s) => cost[s] * used(startYear - lastPainted[s], interval[s])
        ),
      })
    }
  }

  for (const w of workItems) {
    if (
      w.componentId &&
      forcedBy.get(w.componentId) === w &&
      typeOf.has(w.componentId)
    )
      continue
    const cost = workItemCost(w)
    if (!cost) continue
    parts.push({
      type: (w.componentId && typeOf.get(w.componentId)) || 'work_items',
      componentId: w.componentId ?? undefined,
      workItemId: w.id,
      kind: 'work_item',
      sek: cost,
    })
  }

  return {
    total: byScenario((s) => parts.reduce((t, p) => t + p.sek[s], 0)),
    parts,
  }
}

// Debt per component type, typical scenario.
export function debtByType(debt: Debt) {
  const map = new Map<string, number>()
  for (const p of debt.parts)
    map.set(p.type, (map.get(p.type) ?? 0) + p.sek.typical)
  return map
}

// Differences smaller than this are pooled as "other".
export const SMALL_DIFFERENCE_SEK = 20_000

// Why one house's maintenance-adjusted price differs from another's: the
// price difference, then the debt difference per component type, largest
// first, with small ones pooled. The parts add up to the total difference.
export function explainDifference(
  base: { price: number | null; debt: Debt },
  other: { price: number | null; debt: Debt }
) {
  const a = debtByType(base.debt)
  const b = debtByType(other.debt)
  const types = new Set([...a.keys(), ...b.keys()])
  let small = 0
  const parts: { type: string; sek: number }[] = []
  for (const type of types) {
    const sek = (b.get(type) ?? 0) - (a.get(type) ?? 0)
    if (Math.abs(sek) < SMALL_DIFFERENCE_SEK) small += sek
    else parts.push({ type, sek })
  }
  parts.sort((x, y) => Math.abs(y.sek) - Math.abs(x.sek))
  if (small) parts.push({ type: 'other', sek: small })
  const debt = other.debt.total.typical - base.debt.total.typical
  const price =
    base.price !== null && other.price !== null
      ? other.price - base.price
      : null
  return {
    price,
    debt,
    debtByType: parts,
    adjustedPrice: price === null ? null : price + debt,
  }
}
