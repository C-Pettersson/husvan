// Loads what the forecast needs and runs it for a house: the library with
// its price index, the user's assumptions, energy prices and tariff trends
// for the municipality. Shared by the MCP tools and, later, the web.
import type { PrismaClient, TariffCategory } from '@prisma/client'
import { energyPrices } from '../../../prisma/data/municipalities.mts'
import {
  assumptionValues,
  type AssumptionValues,
} from '@/server/houses/assumptions'
import { pickPrice, risks, valueOf } from '@/server/houses/derive'
import { getHouse } from '@/server/houses/getHouse'
import { forecastDefaultsSchema } from '@/server/library/schema'
import { maintenanceDebt } from './debt'
import { flag, type Flag } from './flags'
import { computeForecast, workItemCost } from './forecast'
import { planComponents, type Library, type ProfileRow } from './plan'
import { runningCosts } from './running'

const BKI = 'bki_small_houses'

export const DEFAULT_HORIZON_YEARS = 15

const num = (d: { toString(): string } | null) =>
  d === null ? null : Number(d)

export async function loadLibrary(
  prisma: PrismaClient,
  startYear: number
): Promise<Library & { indexYear: number }> {
  const [types, profiles, index] = await Promise.all([
    prisma.componentType.findMany({
      select: { type: true, forecastDefaults: true },
    }),
    prisma.lifespanProfile.findMany(),
    prisma.priceIndex.findMany({ where: { series: BKI } }),
  ])
  // Yearly means of the monthly index; a start year after the latest data
  // uses the latest year.
  const byYear = new Map<number, number[]>()
  for (const r of index) {
    const y = r.period.getUTCFullYear()
    byYear.set(y, [...(byYear.get(y) ?? []), Number(r.value)])
  }
  const mean = (y: number) => {
    const v = byYear.get(y)
    return v ? v.reduce((a, b) => a + b, 0) / v.length : undefined
  }
  const indexYear = Math.min(startYear, Math.max(...byYear.keys()))
  const target = mean(indexYear)

  return {
    indexYear,
    defaults: new Map(
      types.map((t) => [
        t.type,
        forecastDefaultsSchema.safeParse(t.forecastDefaults).data ?? {},
      ])
    ),
    profiles: profiles.map((p): ProfileRow => ({
      type: p.type,
      match: p.match as Record<string, string>,
      lifespanMinYears: p.lifespanMinYears,
      lifespanTypicalYears: p.lifespanTypicalYears,
      lifespanMaxYears: p.lifespanMaxYears,
      costLowSek: num(p.costLowSek),
      costHighSek: num(p.costHighSek),
      costUnit: p.costUnit,
      priceYear: p.priceYear,
      repaintMinYears: p.repaintMinYears,
      repaintTypicalYears: p.repaintTypicalYears,
      repaintMaxYears: p.repaintMaxYears,
      repaintCostLowSek: num(p.repaintCostLowSek),
      repaintCostHighSek: num(p.repaintCostHighSek),
    })),
    indexFactor: (priceYear) => {
      const from = mean(Math.min(priceYear, indexYear))
      return from && target ? target / from : 1
    },
  }
}

export type ResolvedAssumptions = {
  values: Required<
    Pick<
      AssumptionValues,
      'horizon_years' | 'start_year' | 'operating_cost_trend'
    >
  > &
    Omit<
      AssumptionValues,
      'horizon_years' | 'start_year' | 'operating_cost_trend'
    >
  // Where each value came from: the house, all houses or the default.
  source: Record<string, 'house' | 'all_houses' | 'default' | 'this_forecast'>
}

// The newest approved assumption per key for the house, else for all
// houses, else the defaults (CLAUDE.md, "Regler för beräkningen").
export async function resolveAssumptions(
  prisma: PrismaClient,
  houseId: string,
  now = new Date()
): Promise<ResolvedAssumptions> {
  const rows = await prisma.assumption.findMany({
    where: {
      OR: [{ houseId }, { houseId: null }],
      changeset: { status: 'APPROVED' },
    },
    orderBy: { createdAt: 'asc' },
  })
  const house: Record<string, unknown> = {}
  const all: Record<string, unknown> = {}
  for (const r of rows) (r.houseId ? house : all)[r.key] = r.value
  const source: ResolvedAssumptions['source'] = {}
  const merged: Record<string, unknown> = {
    horizon_years: DEFAULT_HORIZON_YEARS,
    start_year: now.getUTCFullYear(),
    operating_cost_trend: 'none',
  }
  for (const k of Object.keys(merged)) source[k] = 'default'
  for (const [k, v] of Object.entries(all)) {
    merged[k] = v
    source[k] = 'all_houses'
  }
  for (const [k, v] of Object.entries(house)) {
    merged[k] = v
    source[k] = 'house'
  }
  const values = assumptionValues.parse(merged) as ResolvedAssumptions['values']
  return { values, source }
}

export async function analyseHouse(
  prisma: PrismaClient,
  {
    ownerId,
    houseId,
    overrides,
  }: { ownerId: string; houseId: string; overrides?: AssumptionValues }
) {
  const view = await getHouse(prisma, { ownerId, houseId })
  if (!view) return null
  const resolved = await resolveAssumptions(prisma, houseId)
  const a = { ...resolved.values, ...overrides }
  for (const k of Object.keys(overrides ?? {}))
    resolved.source[k] = 'this_forecast'
  const startYear = a.start_year
  const library = await loadLibrary(prisma, startYear)

  const code = view.municipality?.code
  const municipality = code
    ? await prisma.municipality.findUnique({
        where: { code },
        include: { tariffChanges: true },
      })
    : null
  const prices = {
    electricitySekPerKwh:
      a.electricity_price_sek_kwh ??
      (code
        ? (energyPrices.electricitySekPerKwh as Record<string, number | null>)[
            code
          ]
        : null) ??
      null,
    districtHeatingSekPerKwh:
      a.district_heating_price_sek_kwh ??
      (code
        ? (
            energyPrices.districtHeatingSekPerKwh as Record<
              string,
              number | null
            >
          )[code]
        : null) ??
      null,
  }

  let trend: Partial<Record<TariffCategory, number>> | null = null
  const flags: Flag[] = []
  if (a.operating_cost_trend === 'municipality') {
    if (!municipality?.tariffChanges.length) {
      flags.push(flag('no_tariff_changes'))
    } else {
      trend = {}
      for (const category of [
        'WATER_SEWAGE',
        'WASTE',
        'ELECTRICITY',
        'DISTRICT_HEATING',
      ] as const) {
        const changes = municipality.tariffChanges
          .filter((t) => t.category === category)
          .map((t) => Number(t.changeFraction))
        if (changes.length)
          trend[category] = changes.reduce((x, y) => x + y, 0) / changes.length
      }
    }
  }

  let capital = null
  if (a.interest_rate !== undefined) {
    if (a.loan_sek === undefined) flags.push(flag('interest_without_loan'))
    else capital = { interestRate: a.interest_rate, loanSek: a.loan_sek }
  }

  const plans = planComponents(view.components, view.values, library, startYear)
  const inspected = view.documents.some((d) => d.type === 'INSPECTION')
  if (!inspected) flags.push(flag('not_inspected'))
  const workItems = view.workItems
  const running = runningCosts(
    view.values,
    view.components,
    prices,
    num(municipality?.fgeo ?? null)
  )
  const forecast = computeForecast({
    startYear,
    horizonYears: a.horizon_years,
    plans,
    workItems,
    running: running.lines,
    trend,
    capital,
  })
  const debt = maintenanceDebt(plans, workItems, startYear)
  const price = pickPrice(view.values)
  const assessed = valueOf(view.values, 'assessed_value_sek')

  return {
    view,
    assumptions: { values: a, source: resolved.source, energyPrices: prices },
    price,
    forecast,
    debt,
    adjustedPrice: price
      ? {
          low: price.sek + debt.total.low,
          typical: price.sek + debt.total.typical,
          high: price.sek + debt.total.high,
        }
      : null,
    priceToAssessed:
      price && typeof assessed === 'number' && assessed > 0
        ? {
            ratio: price.sek / assessed,
            assessmentYear: valueOf(view.values, 'assessment_year') ?? null,
          }
        : null,
    risks: risks(view.components, view.values),
    runningCostsKnown: running.lines.length > 0,
    // What the totals leave out or guess, said next to them.
    gaps: {
      // Without an inspection protocol, defects are unknown, not none.
      inspected,
      workItemsWithoutCost: workItems.filter((w) => !workItemCost(w)).length,
      assumedParts: plans
        .filter((p) => p.assumed)
        .map((p) => ({
          type: p.type,
          maintenanceDebtTypical: debt.parts
            .filter((d) => d.componentId === p.componentId)
            .reduce((t, d) => t + d.sek.typical, 0),
        })),
      partsWithoutInstallationYear: plans.filter(
        (p) => !p.assumed && p.installYearGuessed
      ).length,
      partsWithoutCost: plans.filter((p) => !p.cost).length,
    },
    flags: [...flags, ...running.flags],
    indexYear: library.indexYear,
  }
}

export type Analysis = NonNullable<Awaited<ReturnType<typeof analyseHouse>>>
