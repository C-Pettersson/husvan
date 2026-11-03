// Houses side by side (CLAUDE.md, "Underhållsskuld och underhållsjusterat
// pris" and "Ojämn redovisning"), cheapest maintenance-adjusted price first.
// Shared by the compare tool and the web.
import type { PrismaClient } from '@prisma/client'
import { areaStatistics, houseAreas } from '@/server/houses/area'
import {
  FEATURES,
  featureAnswer,
  flatten,
  pickPrice,
  risks,
  valueOf,
} from '@/server/houses/derive'
import { EXTERNAL_ID_KEYS } from '@/server/houses/externalId'
import { explainDifference } from './debt'
import { findingsByType } from './findings'
import { analyseHouse, type Analysis } from './run'

type Range = { low: number; typical: number; high: number }

const KEY_FIGURES = [
  'living_area',
  'secondary_area',
  'plot_area',
  'construction_year',
  'room_count',
  'energy_class',
]

// One line per house in a listing.
export function listSummary({ view, debt, adjustedPrice }: Analysis) {
  return {
    id: view.id,
    address: view.address,
    municipality: view.municipality?.name ?? null,
    status: view.status,
    saleStatus: valueOf(view.values, 'sale_status') ?? null,
    price: pickPrice(view.values),
    keyFigures: Object.fromEntries(
      KEY_FIGURES.map((k) => [k, valueOf(view.values, k) ?? null])
    ),
    // booli_id and listing_id, for a watch to recognise the house by.
    externalIds: Object.fromEntries(
      EXTERNAL_ID_KEYS.map((k) => [k, valueOf(view.values, k) ?? null])
    ),
    // Risk constructions, older electrical systems and radon together.
    flaggedRisks: risks(view.components, view.values).length,
    openDrafts: view.drafts.length,
    maintenanceDebt: Math.round(debt.total.typical),
    maintenanceAdjustedPrice:
      adjustedPrice && Math.round(adjustedPrice.typical),
  }
}

// The figures every answer about a house's cost starts with.
export function costSummary(a: Analysis) {
  return {
    price: a.price,
    maintenanceDebt: a.debt.total,
    maintenanceAdjustedPrice: a.adjustedPrice,
    priceToAssessedValue: a.priceToAssessed,
    forecastTotal: a.forecast.total,
    forecastPerMonth: a.forecast.perMonth,
    // Replacements and repaints spread over their lifespans, plus running
    // costs and interest.
    annualCost: {
      wear: a.annual.wear,
      running: a.annual.running,
      capital: a.annual.capital,
      perMonth: a.annual.perMonth,
    },
    gaps: a.gaps,
  }
}

// The cost figures per square metre of living area, so that houses of
// different size compare (132 against 121 m2). null without living_area.
export function perLivingM2(
  a: Pick<Analysis, 'view' | 'price' | 'adjustedPrice' | 'forecast' | 'annual'>
) {
  const area = valueOf(a.view.values, 'living_area')
  const m2 = typeof area === 'number' && area > 0 ? area : null
  const range = (r: Range | null) =>
    m2 && r
      ? { low: r.low / m2, typical: r.typical / m2, high: r.high / m2 }
      : null
  return {
    livingAreaM2: m2,
    price: m2 && a.price ? a.price.sek / m2 : null,
    maintenanceAdjustedPrice: range(a.adjustedPrice),
    forecastTotal: range(a.forecast.total),
    forecastPerMonth: range(a.forecast.perMonth),
    annualPerMonth: range(a.annual.perMonth),
  }
}

// Debt per component type with its range, largest first.
export function debtRangesByType(a: Analysis) {
  const map = new Map<string, { low: number; typical: number; high: number }>()
  for (const p of a.debt.parts) {
    const t = map.get(p.type) ?? { low: 0, typical: 0, high: 0 }
    map.set(p.type, {
      low: t.low + p.sek.low,
      typical: t.typical + p.sek.typical,
      high: t.high + p.sek.high,
    })
  }
  return [...map]
    .map(([type, sek]) => ({ type, ...sek }))
    .sort((x, y) => y.typical - x.typical)
}

export const features = (a: Analysis) =>
  Object.fromEntries(
    FEATURES.map((f) => [f, featureAnswer(f, a.view.components, a.view.values)])
  )

export async function compareHouses(
  prisma: PrismaClient,
  { ownerId, houseIds }: { ownerId: string; houseIds: string[] }
) {
  const analyses = await Promise.all(
    houseIds.map((houseId) => analyseHouse(prisma, { ownerId, houseId }))
  )
  const missing = houseIds.filter((_, i) => !analyses[i])
  if (missing.length) return { ok: false as const, missing }
  const houses = (analyses as Analysis[]).sort(
    (x, y) =>
      (x.adjustedPrice?.typical ?? Infinity) -
      (y.adjustedPrice?.typical ?? Infinity)
  )
  const [base] = houses

  // Forecast items whose typical totals differ most across the houses.
  const totals = new Map<string, number[]>()
  houses.forEach((h, i) => {
    for (const item of h.forecast.items) {
      const key = `${item.category}:${item.key}`
      const row = totals.get(key) ?? houses.map(() => 0)
      row[i] += item.total.typical
      totals.set(key, row)
    }
  })
  // An unknown running cost is not zero: null, and left out of the spread.
  const largestForecastDifferences = [...totals]
    .map(([key, row]) => {
      const sek = row.map((v, i) =>
        key.startsWith('running:') && !houses[i].runningCostsKnown ? null : v
      )
      const known = sek.filter((v): v is number => v !== null)
      return {
        item: key,
        sek,
        spread: Math.max(...known) - Math.min(...known),
      }
    })
    .filter((d) => Number.isFinite(d.spread))
    .sort((x, y) => y.spread - x.spread)
    .slice(0, 8)

  return {
    ok: true as const,
    houses: await Promise.all(
      houses.map(async (h) => ({
        id: h.view.id,
        address: h.view.address,
        status: h.view.status,
        ...costSummary(h),
        perLivingM2: perLivingM2(h),
        runningCostsKnown: h.runningCostsKnown,
        horizon: {
          startYear: h.forecast.startYear,
          years: h.forecast.horizonYears,
        },
        features: features(h),
        risks: h.risks,
        flags: h.flags,
        area: await areaStatistics(prisma, houseAreas(h.view)),
      }))
    ),
    againstFirst: houses.slice(1).map((h) => ({
      id: h.view.id,
      address: h.view.address,
      ...explainDifference(
        { price: base.price?.sek ?? null, debt: base.debt },
        { price: h.price?.sek ?? null, debt: h.debt }
      ),
    })),
    largestForecastDifferences,
    inspectionFindings: findingsByType(
      houses.map((h) => ({
        inspected: h.gaps.inspected,
        workItems: h.view.workItems,
        typeOf: new Map(flatten(h.view.components).map((c) => [c.id, c.type])),
      }))
    ).map((row) => ({ componentType: row.type, byHouse: row.perHouse })),
  }
}

export type Comparison = Extract<
  Awaited<ReturnType<typeof compareHouses>>,
  { ok: true }
>
