// Forecast and comparison tools (CLAUDE.md, "Kostnadsprognos" and
// "Underhållsskuld och underhållsjusterat pris"). Every forecast is saved,
// so the user can see how the assessment of a house changes.
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'
import type { Prisma, PrismaClient } from '@prisma/client'
import { explainDifference } from '@/server/forecast/debt'
import { findingsByType } from '@/server/forecast/findings'
import { analyseHouse, type Analysis } from '@/server/forecast/run'
import { areaStatistics, houseAreas } from '@/server/houses/area'
import { assumptionValues } from '@/server/houses/assumptions'
import { FEATURES, featureAnswer, flatten } from '@/server/houses/derive'
import { result, toolError } from './result'

// Not part of the forecast yet; said with every answer so Claude does not
// present the total as complete.
const NOT_MODELLED = [
  'Snow removal and roof snow clearing by snow zone.',
  'Scaffolding for facade repainting (about 0–35 000 kr per occasion by storeys).',
  'Work items without a cost count as zero; they are listed with a flag.',
]

// Whole kronor and short ratios keep the answer readable.
function rounded(value: unknown): unknown {
  if (typeof value === 'number')
    return Math.abs(value) >= 10
      ? Math.round(value)
      : Math.round(value * 100) / 100
  if (Array.isArray(value)) return value.map(rounded)
  if (value && typeof value === 'object' && !(value instanceof Date))
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, rounded(v)])
    )
  return value
}

function summary(a: Analysis) {
  return {
    price: a.price,
    maintenanceDebt: a.debt.total,
    maintenanceAdjustedPrice: a.adjustedPrice,
    priceToAssessedValue: a.priceToAssessed,
    forecastTotal: a.forecast.total,
    forecastPerMonth: a.forecast.perMonth,
    gaps: a.gaps,
  }
}

// Items with their typical cost per year as {year: sek}; a running cost
// that is the same every year gives it once.
function items(a: Analysis) {
  return [...a.forecast.items]
    .sort((x, y) => y.total.typical - x.total.typical)
    .map(({ typical, ...item }) => {
      const flat =
        item.category === 'running' &&
        typical.every((e) => e.sek === typical[0]?.sek)
      return flat
        ? { ...item, perYearTypical: typical[0]?.sek ?? 0 }
        : {
            ...item,
            typicalByYear: Object.fromEntries(
              typical.map((e) => [e.year, e.sek])
            ),
          }
    })
}

function debtByType(a: Analysis) {
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

const overridesInput = assumptionValues.describe(
  'One-off assumptions for this forecast only, not saved; set_assumption saves them.'
)

export function registerForecastTools(
  server: McpServer,
  prisma: PrismaClient,
  userId: string
) {
  server.registerTool(
    'forecast',
    {
      title: 'Forecast',
      description:
        'Cost per year and item for one house over the horizon, in start-year kronor: replacements by lifespan, repainting of painted wood, work items, running costs and, if the user set an interest rate and loan, interest. ' +
        'Every figure has a range: low uses the longest lifespans and lowest costs, high the shortest and highest; it widens for missing or uncertain inputs, which each item lists under flags. ' +
        'Each scenario is a whole path with its own replacement years, so in a single year low or high can fall on either side of typical; the totals are ordered. ' +
        'Where a part can be renewed more cheaply than replaced, such as relining old cast-iron sewer pipes, low and typical renew it that way (renewedAs) and high replaces it, and an inspection (filming) is added before the first renewal of parts not inspected yet. ' +
        'gaps counts work items without a cost (they count as zero), parts with the construction year as their installation year and parts without a cost, says whether there is an inspection protocol, and lists assumedParts: parts every house has that the documents do not mention, counted from the construction year so that saying less does not make a house cheaper; their items have assumed: true. Say these next to the total, and call an assumed part assumed, never documented. ' +
        'Also the maintenance debt (the used-up share of every part, independent of the horizon) and the maintenance-adjusted price = price + debt. ' +
        'Each call is saved; previous gives the last saved forecast so you can say how the assessment changed. Tell the user what notModelled leaves out.',
      inputSchema: z.object({
        houseId: z.uuid(),
        overrides: overridesInput.optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ houseId, overrides }) => {
      const a = await analyseHouse(prisma, {
        ownerId: userId,
        houseId,
        overrides,
      })
      if (!a) return toolError(`No house with id ${houseId}.`)
      const answer = rounded({
        house: { id: a.view.id, address: a.view.address },
        assumptions: a.assumptions,
        ...summary(a),
        years: a.forecast.years,
        items: items(a),
        maintenanceDebtByType: debtByType(a),
        risks: a.risks,
        flags: a.flags,
        priceIndexYear: a.indexYear,
        notModelled: NOT_MODELLED,
      }) as Record<string, unknown>

      const previous = await prisma.forecast.findFirst({
        where: { houseId },
        orderBy: { calculatedAt: 'desc' },
        select: { calculatedAt: true, result: true },
      })
      const saved = await prisma.forecast.create({
        data: {
          houseId,
          assumptions: answer.assumptions as Prisma.InputJsonValue,
          result: answer as Prisma.InputJsonValue,
        },
        select: { id: true },
      })
      const before = previous?.result as Record<string, unknown> | undefined
      return result({
        forecastId: saved.id,
        ...answer,
        previous: previous && {
          calculatedAt: previous.calculatedAt.toISOString(),
          forecastTotal: before?.forecastTotal,
          maintenanceDebt: before?.maintenanceDebt,
          maintenanceAdjustedPrice: before?.maintenanceAdjustedPrice,
        },
      })
    }
  )

  server.registerTool(
    'compare',
    {
      title: 'Compare houses',
      description:
        'Several houses side by side, cheapest maintenance-adjusted price first: price, maintenance debt and maintenance-adjusted price with ranges, price to assessed value, and the forecast total and per month. ' +
        'A house without known running costs has a lower forecast for that reason only: runningCostsKnown says so, and its running items are null in largestForecastDifferences. ' +
        'Then, against the first house, the price difference explained per component type (debt differences under 20 000 kr pooled as "other"); the forecast items that differ most; features (unknown is not no); flagged risks, which are never turned into kronor; and area statistics with their level and year. ' +
        'Area figures are context: never call one area better or worse. ' +
        'Disclosure is uneven: a house without an inspection protocol (gaps.inspected false) has unknown defects, not none, and its cells in inspectionFindings are null. A finding in one house is no evidence that another lacks it; when the other is uninspected, say the finding may apply there too, and that its lower figure may come from knowing less. ' +
        'Parts every house has but whose documents do not mention them are assumed from the construction year (gaps.assumedParts), so they still count.',
      inputSchema: z.object({
        houseIds: z.array(z.uuid()).min(2).max(6),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ houseIds }) => {
      const analyses = await Promise.all(
        houseIds.map((houseId) =>
          analyseHouse(prisma, { ownerId: userId, houseId })
        )
      )
      const missing = houseIds.filter((_, i) => !analyses[i])
      if (missing.length)
        return toolError(`No house with id ${missing.join(', ')}.`)
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
      const largestDifferences = [...totals]
        .map(([key, row]) => {
          const sek = row.map((v, i) =>
            key.startsWith('running:') && !houses[i].runningCostsKnown
              ? null
              : v
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

      return result(
        rounded({
          houses: await Promise.all(
            houses.map(async (h) => ({
              id: h.view.id,
              address: h.view.address,
              status: h.view.status,
              ...summary(h),
              runningCostsKnown: h.runningCostsKnown,
              horizon: {
                startYear: h.forecast.startYear,
                years: h.forecast.horizonYears,
              },
              features: Object.fromEntries(
                FEATURES.map((f) => [
                  f,
                  featureAnswer(f, h.view.components, h.view.values),
                ])
              ),
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
          largestForecastDifferences: largestDifferences,
          inspectionFindings: findingsByType(
            houses.map((h) => ({
              inspected: h.gaps.inspected,
              workItems: h.view.workItems,
              typeOf: new Map(
                flatten(h.view.components).map((c) => [c.id, c.type])
              ),
            }))
          ).map((row) => ({
            componentType: row.type,
            byHouse: row.perHouse,
          })),
          notModelled: NOT_MODELLED,
        }) as Record<string, unknown>
      )
    }
  )
}
