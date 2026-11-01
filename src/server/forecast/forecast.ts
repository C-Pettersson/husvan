// The cost forecast for one house (CLAUDE.md, "Kostnadsprognos"): cost per
// year and item over the horizon, in start-year kronor, in three scenarios.
// Pure: the caller loads the house, the library and the assumptions.
import type { TariffCategory, WorkItemKind } from '@prisma/client'
import {
  SCENARIOS,
  byScenario,
  type ByScenario,
  type ComponentPlan,
  type Scenario,
} from './plan'
import type { RunningLine } from './running'

export type WorkItemInput = {
  id: string
  componentId: string | null
  kind: WorkItemKind
  description: string
  yearMin: number | null
  yearMax: number | null
  costLowSek: number | null
  costHighSek: number | null
}

export type Category =
  'replacement' | 'repaint' | 'inspection' | 'work_item' | 'running' | 'capital'

export type ForecastItem = {
  category: Category
  key: string // component type, running cost key or 'interest'
  componentId?: string
  workItemId?: string
  name?: string
  // Not in the documents; a part every house has, assumed by Husvan.
  assumed?: true
  // How low and typical renew the part instead of replacing it.
  renewedAs?: Record<string, string>
  // Cost per year in the typical scenario; years without cost are left out.
  typical: { year: number; sek: number }[]
  total: ByScenario
  flags: string[]
}

export type Forecast = {
  startYear: number
  horizonYears: number
  years: {
    year: number
    total: ByScenario
    typicalByCategory: Partial<Record<Category, number>>
  }[]
  items: ForecastItem[]
  total: ByScenario
  perMonth: ByScenario
}

export type ForecastInput = {
  startYear: number
  horizonYears: number
  plans: ComponentPlan[]
  workItems: WorkItemInput[]
  running: RunningLine[]
  // Mean yearly change per tariff category, when the user chose a trend.
  trend: Partial<Record<TariffCategory, number>> | null
  capital: { interestRate: number; loanSek: number } | null
}

// Midpoint of a work item's years, or the start year when it has none.
export function workItemYears(w: WorkItemInput, startYear: number) {
  const first = w.yearMin ?? w.yearMax
  const last = w.yearMax ?? w.yearMin
  return first === null || last === null
    ? { first: startYear, last: startYear, given: false }
    : { first, last, given: true }
}

export function workItemCost(w: WorkItemInput): ByScenario | null {
  const low = w.costLowSek ?? w.costHighSek
  const high = w.costHighSek ?? w.costLowSek
  return low === null || high === null
    ? null
    : { low, typical: (low + high) / 2, high }
}

// A REPLACEMENT work item on a component sets when and at what cost the
// component is first replaced, so it is never counted twice.
export function replacementItems(workItems: WorkItemInput[]) {
  const map = new Map<string, WorkItemInput>()
  for (const w of workItems)
    if (w.kind === 'REPLACEMENT' && w.componentId && !map.has(w.componentId))
      map.set(w.componentId, w)
  return map
}

type Event = { year: number; sek: number }

// Whether the scenario renews the part the cheaper way: low and typical do,
// high assumes the inspection rules it out.
export const renewsCheaper = (plan: ComponentPlan, s: Scenario) =>
  plan.renewal !== null && s !== 'high'

// Replacement and repaint years of one component in one scenario.
export function schedule(
  plan: ComponentPlan,
  s: Scenario,
  startYear: number,
  endYear: number,
  forced?: { year: number; cost: number | null }
) {
  const replacements: Event[] = []
  const repaints: Event[] = []
  let overdueReplacement = false
  let overdueRepaint = false

  let next = forced
    ? forced.year
    : plan.soon
      ? s === 'high'
        ? startYear
        : startYear + 1
      : plan.installYear[s] + plan.lifespan[s]
  if (next < startYear) {
    next = startYear
    overdueReplacement = true
  }
  const cheaper = renewsCheaper(plan, s) ? plan.renewal : null
  let first = true
  while (next <= endYear) {
    const sek =
      first && forced?.cost != null
        ? forced.cost
        : (cheaper?.cost[s] ?? plan.cost?.[s])
    if (sek != null) replacements.push({ year: next, sek })
    first = false
    next += (cheaper?.fullLifespan ?? plan.fullLifespan)[s]
  }

  if (plan.repaint) {
    const { interval, cost, lastPainted } = plan.repaint
    let painted = lastPainted[s]
    let due = painted + interval[s]
    if (due < startYear) {
      due = startYear
      overdueRepaint = true
    }
    while (due <= endYear) {
      // A replacement before the repaint comes painted.
      const replaced = replacements.find(
        (r) => r.year > painted && r.year <= due
      )
      if (replaced) {
        painted = replaced.year
        due = painted + interval[s]
        continue
      }
      repaints.push({ year: due, sek: cost[s] })
      painted = due
      due += interval[s]
    }
  }
  return { replacements, repaints, overdueReplacement, overdueRepaint }
}

export function computeForecast(input: ForecastInput): Forecast {
  const { startYear, horizonYears } = input
  const endYear = startYear + horizonYears - 1
  const years = Array.from({ length: horizonYears }, (_, i) => startYear + i)
  type Entry = {
    item: Omit<ForecastItem, 'typical' | 'total'>
    events: ByScenario<Event[]>
  }
  const entries: Entry[] = []
  const add = (item: Entry['item'], events: Entry['events']) => {
    if (SCENARIOS.some((s) => events[s].length)) entries.push({ item, events })
  }

  // Components: replacements by lifespan, and repaints between them.
  const forcedBy = replacementItems(input.workItems)
  const planned = new Set(input.plans.map((p) => p.componentId))
  // One inspection per type and house, the year before the first part not
  // inspected yet may need renewing.
  const inspections = new Map<
    string,
    { year: number; cost: ByScenario; components: string[] }
  >()
  for (const plan of input.plans) {
    const w = forcedBy.get(plan.componentId)
    const cost = w && workItemCost(w)
    const runs = byScenario((s) => {
      let forced
      if (w) {
        const { first, last } = workItemYears(w, startYear)
        forced = {
          year: Math.max(startYear, Math.round((first + last) / 2)),
          cost: cost ? cost[s] : null,
        }
      }
      return schedule(plan, s, startYear, endYear, forced)
    })
    const base = {
      key: plan.type,
      componentId: plan.componentId,
      name: plan.name ?? undefined,
      assumed: plan.assumed ? (true as const) : undefined,
    }
    const flags = [...plan.flags]
    if (runs.typical.overdueReplacement && !w)
      flags.push('past its lifespan; replacement put in the start year')
    if (w) flags.push(`timed by work item: ${w.description}`)
    if (!plan.cost && !cost) flags.push('replacement not costed')
    if (plan.renewal && !cost)
      flags.push(
        `low and typical renew it as ${Object.entries(plan.renewal.match)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')}; high replaces it`
      )
    add(
      {
        ...base,
        category: 'replacement',
        workItemId: w?.id,
        renewedAs: plan.renewal && !cost ? plan.renewal.match : undefined,
        flags,
      },
      byScenario((s) => runs[s].replacements)
    )
    if (plan.inspection) {
      // The earliest renewal in any scenario, which is high's.
      const due = runs.high.replacements[0]?.year
      if (due !== undefined) {
        const year = Math.max(startYear, due - 1)
        const seen = inspections.get(plan.type)
        if (!seen || year < seen.year)
          inspections.set(plan.type, {
            year,
            cost: plan.inspection,
            components: [...(seen?.components ?? []), plan.componentId],
          })
        else seen.components.push(plan.componentId)
      }
    }
    if (plan.repaint)
      add(
        {
          ...base,
          category: 'repaint',
          flags: runs.typical.overdueRepaint
            ? ['repaint overdue; put in the start year']
            : [],
        },
        byScenario((s) => runs[s].repaints)
      )
  }

  for (const [type, i] of inspections)
    add(
      {
        category: 'inspection',
        key: type,
        flags: [
          `added by Husvan for ${i.components.length} part(s) without inspected_year; it decides whether and how they are renewed`,
        ],
      },
      byScenario((s) => [{ year: i.year, sek: i.cost[s] }])
    )

  // Work items, spread evenly over their years; years before the start
  // year land on it. A replacement item already timed a component above.
  for (const w of input.workItems) {
    if (
      w.componentId &&
      forcedBy.get(w.componentId) === w &&
      planned.has(w.componentId)
    )
      continue
    const { first, last, given } = workItemYears(w, startYear)
    const cost = workItemCost(w)
    const flags: string[] = []
    if (!given) flags.push('no year given; put in the start year')
    if (first < startYear) flags.push('due before the start year')
    if (!cost) flags.push('no cost given')
    const span = last - first + 1
    add(
      {
        category: 'work_item',
        key: w.kind.toLowerCase(),
        workItemId: w.id,
        componentId: w.componentId ?? undefined,
        name: w.description,
        flags,
      },
      byScenario((s) =>
        Array.from({ length: span }, (_, i) => ({
          year: Math.max(startYear, first + i),
          sek: (cost?.[s] ?? 0) / span,
        })).filter((e) => e.year <= endYear)
      )
    )
  }

  for (const line of input.running) {
    const change = line.trend ? input.trend?.[line.trend] : undefined
    add(
      {
        category: 'running',
        key: line.key,
        flags: change
          ? [...line.flags, `trended ${(change * 100).toFixed(1)} % a year`]
          : line.flags,
      },
      byScenario((s) =>
        years.map((year) => ({
          year,
          sek: line.base[s] * (1 + (change ?? 0)) ** (year - startYear),
        }))
      )
    )
  }

  if (input.capital) {
    const sek = input.capital.interestRate * input.capital.loanSek
    add(
      { category: 'capital', key: 'interest', flags: [] },
      byScenario(() => years.map((year) => ({ year, sek })))
    )
  }

  const sum = (events: Event[], year?: number) =>
    events
      .filter((e) => year === undefined || e.year === year)
      .reduce((t, e) => t + e.sek, 0)
  const items: ForecastItem[] = entries.map(({ item, events }) => ({
    ...item,
    typical: years
      .map((year) => ({ year, sek: sum(events.typical, year) }))
      .filter((e) => e.sek),
    total: byScenario((s) => sum(events[s])),
  }))
  const perYear = years.map((year) => {
    const typicalByCategory: Partial<Record<Category, number>> = {}
    for (const { item, events } of entries) {
      const sek = sum(events.typical, year)
      if (sek)
        typicalByCategory[item.category] =
          (typicalByCategory[item.category] ?? 0) + sek
    }
    return {
      year,
      total: byScenario((s) =>
        entries.reduce((t, e) => t + sum(e.events[s], year), 0)
      ),
      typicalByCategory,
    }
  })
  const total = byScenario((s) => perYear.reduce((t, y) => t + y.total[s], 0))
  return {
    startYear,
    horizonYears,
    years: perYear,
    items,
    total,
    perMonth: byScenario((s) => total[s] / (horizonYears * 12)),
  }
}
