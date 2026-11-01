// Cost spread over lifespans (CLAUDE.md, "Kostnad fördelad över
// livslängden"): what the house wears out per year, every replacement and
// repaint divided by the years it lasts, beside the running costs. A
// bathroom for 200 000 kr that lasts 25 years is 8 000 kr a year whichever
// year it is paid. Work items are left out: they are maintenance already
// overdue and count in the maintenance debt.
import { byScenario, type ByScenario, type ComponentPlan } from './plan'
import { renewsCheaper } from './forecast'
import type { RunningLine } from './running'

export type AnnualPart = {
  componentId: string
  type: string
  name: string | null
  assumed: boolean
  kind: 'replacement' | 'repaint'
  // How low and typical renew it instead of replacing it.
  renewedAs?: Record<string, string>
  // One replacement or repaint, and the years between them.
  cost: ByScenario
  years: ByScenario
  perYear: ByScenario
}

export type Annual = {
  parts: AnnualPart[]
  wear: ByScenario
  running: ByScenario
  capital: number
  total: ByScenario
  perMonth: ByScenario
}

const sum = (list: ByScenario[]) =>
  byScenario((s) => list.reduce((t, x) => t + x[s], 0))

export function annualCost(
  plans: ComponentPlan[],
  running: RunningLine[],
  capital: { interestRate: number; loanSek: number } | null
): Annual {
  const parts: AnnualPart[] = []
  for (const plan of plans) {
    const base = {
      componentId: plan.componentId,
      type: plan.type,
      name: plan.name,
      assumed: plan.assumed,
    }
    if (plan.cost) {
      // The way each scenario renews it: low and typical the cheaper way
      // where there is one, high by replacing.
      const cost = byScenario((s) =>
        renewsCheaper(plan, s) ? plan.renewal!.cost[s] : plan.cost![s]
      )
      const years = byScenario((s) =>
        renewsCheaper(plan, s)
          ? plan.renewal!.fullLifespan[s]
          : plan.fullLifespan[s]
      )
      parts.push({
        ...base,
        kind: 'replacement',
        renewedAs: plan.renewal?.match,
        cost,
        years,
        perYear: byScenario((s) => cost[s] / years[s]),
      })
    }
    if (plan.repaint) {
      const { cost, interval } = plan.repaint
      parts.push({
        ...base,
        kind: 'repaint',
        cost,
        years: interval,
        perYear: byScenario((s) => cost[s] / interval[s]),
      })
    }
  }
  parts.sort((a, b) => b.perYear.typical - a.perYear.typical)

  const wear = sum(parts.map((p) => p.perYear))
  const runningPerYear = sum(running.map((l) => l.base))
  const interest = capital ? capital.interestRate * capital.loanSek : 0
  const total = byScenario((s) => wear[s] + runningPerYear[s] + interest)
  return {
    parts,
    wear,
    running: runningPerYear,
    capital: interest,
    total,
    perMonth: byScenario((s) => total[s] / 12),
  }
}
