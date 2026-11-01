// Forecast, open questions and comparison tools (CLAUDE.md,
// "Kostnadsprognos", "Underhållsskuld och underhållsjusterat pris" and
// "Öppna frågor"). Every forecast is saved, so the user can see how the
// assessment of a house changes.
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'
import type { Prisma, PrismaClient } from '@prisma/client'
import { getSiteUrl } from '@/lib/siteUrl'
import {
  compareHouses,
  costSummary,
  debtRangesByType,
} from '@/server/forecast/compare'
import { flagText } from '@/server/forecast/flags'
import { analyseHouse, type Analysis } from '@/server/forecast/run'
import { assumptionValues } from '@/server/houses/assumptions'
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

// Items with their typical cost per year as {year: sek}; a running cost
// that is the same every year gives it once.
function items(a: Analysis) {
  return [...a.forecast.items]
    .sort((x, y) => y.total.typical - x.total.typical)
    .map(({ typical, flags, ...rest }) => {
      const item = { ...rest, flags: flags.map(flagText) }
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
        'Flags also carry what the rest of the house says about an item: a part priced by the house’s foundation type (drainage costs more at a basement, and is not assumed on a plinth or stone foundation), quantities from the footprint over the floors, and a part the house has several of, such as a second bathroom, which is less urgent while another works. Weigh these when you say what is urgent; the totals do not change for them. ' +
        'Each scenario is a whole path with its own replacement years, so in a single year low or high can fall on either side of typical; the totals are ordered. ' +
        'Where a part can be renewed more cheaply than replaced, such as relining old cast-iron sewer pipes, low and typical renew it that way (renewedAs) and high replaces it, and an inspection (filming) is added before the first renewal of parts not inspected yet. ' +
        'gaps counts work items without a cost (they count as zero), parts with the construction year as their installation year and parts without a cost, says whether there is an inspection protocol, and lists assumedParts: parts every house has that the documents do not mention, counted from the construction year so that saying less does not make a house cheaper; their items have assumed: true. Say these next to the total, and call an assumed part assumed, never documented. ' +
        'Also the maintenance debt (the used-up share of every part, independent of the horizon) and the maintenance-adjusted price = price + debt. ' +
        'annualCost spreads every replacement and repaint over the years it lasts (a bathroom for 200 000 kr lasting 25 years is 8 000 kr a year), adds running costs and interest, and gives the total per month; annualCostByPart breaks the wear down. It leaves out work items, which are overdue maintenance counted in the debt. Use it when the user asks what the house costs per year or month regardless of when things are paid. ' +
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
        ...costSummary(a),
        years: a.forecast.years,
        items: items(a),
        maintenanceDebtByType: debtRangesByType(a),
        annualCostByPart: a.annual.parts.map((p) => ({
          type: p.type,
          name: p.name ?? undefined,
          assumed: p.assumed || undefined,
          kind: p.kind,
          renewedAs: p.renewedAs,
          cost: p.cost,
          years: p.years,
          perYear: p.perYear,
        })),
        risks: a.risks,
        flags: a.flags.map(flagText),
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
    'open_questions',
    {
      title: 'Open questions',
      description:
        'What the analysis of one house does not know yet, and how much each answer could move it: the basis for a short, prioritised checklist before a viewing, so that the user can tick off the few things that make the assessment markedly more certain. ' +
        'Each question is one input the forecast reads that is missing, guessed or uncertain (why), on a part (componentId, type, name) or on the house (type "house"). answers gives the maintenance debt and the forecast total (typical, start-year kronor, the whole house) with each possible answer, the rest of the house as it is now; swing is the largest minus the smallest. One input at a time: the swing of a condition is small while the installation year is unknown, since an old part is used up whatever its condition. usedNow is what the forecast assumes meanwhile, such as the construction year. ' +
        'documented false means the documents do not mention the part, and componentId is assumed:<type>: the forecast assumes it from the construction year, or reads it as context (the foundation type prices the drainage). ' +
        'decides names a flagged risk the answer settles (risk construction, older electrical system, radon), which has no kronor but matters for the purchase. swing null means nothing can be computed: a quantity estimated from the living area, a work item without a cost, unknown running costs. A running cost worked out from energy has a swing that is its range over the horizon. ' +
        'Sorted by the larger of the two swings, then risks, then the rest. inspected false means there is no inspection protocol, so defects are unknown; no question here settles that. ' +
        'Each question says how it is answered. id is what answer_questions takes. how is look (seen at the house) or ask (asked of the agent or seller), a default you may override. options are quick answers with an English label, a meaning for wording them and a confidence: a span of years ago is stored as its middle year at 0.7, a condition grade at 0.8. manual, when not null, allows any other value of its datatype and unit; null means only the options. ' +
        'You choose what goes on the list: usually five to ten items the user can see, count or ask about at a viewing (the age of the roof, windows and heating, the fuse box, the foundation, recent renovations, the heating bills), with roughly what each is worth. Leave out what needs a professional unless it is the largest open item. A swing is how far the figure can move, not a saving. ' +
        'For use at the viewing, an artifact works best: a phone-sized checklist in Swedish, one compact row per question led by the part, the amount at stake on the right, one row open at a time with its options as large buttons, a field for manual, and "Vet inte" to skip; split into look and ask, with progress, and the next row opening after each answer. Give it the question ids and, at the end, the answers as a list the user sends back to you. ' +
        'Record the answers with answer_questions, which puts each where it belongs; the user can also answer at checklistUrl.',
      inputSchema: z.object({ houseId: z.uuid() }),
      annotations: { readOnlyHint: true },
    },
    async ({ houseId }) => {
      const a = await analyseHouse(prisma, { ownerId: userId, houseId })
      if (!a) return toolError(`No house with id ${houseId}.`)
      const open = a.openQuestions()
      return result(
        rounded({
          house: { id: a.view.id, address: a.view.address },
          // The same checklist on the web, for answering by hand.
          checklistUrl: `${getSiteUrl()}/houses/${a.view.id}?tab=viewing`,
          startYear: a.forecast.startYear,
          horizonYears: a.forecast.horizonYears,
          now: open.now,
          inspected: open.inspected,
          questions: open.questions,
        }) as Record<string, unknown>
      )
    }
  )

  server.registerTool(
    'compare',
    {
      title: 'Compare houses',
      description:
        'Several houses side by side, cheapest maintenance-adjusted price first: price, maintenance debt and maintenance-adjusted price with ranges, price to assessed value, the forecast total and per month, and annualCost.perMonth: running costs plus every replacement and repaint spread over the years it lasts, which does not depend on when things fall due. ' +
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
      const c = await compareHouses(prisma, { ownerId: userId, houseIds })
      if (!c.ok) return toolError(`No house with id ${c.missing.join(', ')}.`)
      return result(
        rounded({
          houses: c.houses.map((h) => ({
            ...h,
            flags: h.flags.map(flagText),
          })),
          againstFirst: c.againstFirst,
          largestForecastDifferences: c.largestForecastDifferences,
          inspectionFindings: c.inspectionFindings,
          notModelled: NOT_MODELLED,
        }) as Record<string, unknown>
      )
    }
  )
}
