// Read tools (CLAUDE.md, "MCP-verktyg i version 1"): list_houses, get_house
// and type_library. Descriptions and answers are in English; Claude answers
// the user in Swedish. Only approved data is returned; open drafts are
// listed, not mixed in.
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'
import type { PrismaClient } from '@prisma/client'
import { areaStatistics, houseAreas } from '@/server/houses/area'
import { listSummary } from '@/server/forecast/compare'
import { analyseHouse, type Analysis } from '@/server/forecast/run'
import {
  FEATURES,
  bathroomCount,
  featureAnswer,
  heating,
  pickPrice,
  risks,
} from '@/server/houses/derive'
import {
  getHouse,
  type ComponentView,
  type KeyValueView,
  type ValueRow,
} from '@/server/houses/getHouse'
import { HOUSE_KEYS } from '@/server/library/houseKeys'
import { result, toolError } from './result'

const row = (r: ValueRow, withQuote: boolean) => ({
  value: r.value,
  unit: r.unit ?? undefined,
  source: r.source,
  confidence: r.confidence,
  documentId: r.documentId ?? undefined,
  quote: withQuote ? (r.quote ?? undefined) : undefined,
  draft: r.draft || undefined,
})

// Current value per key with its source, and the other reported values as
// alternatives.
function values(list: KeyValueView[]) {
  return Object.fromEntries(
    list.map((v) => [
      v.key,
      {
        ...row(v.current, true),
        alternatives: v.alternatives.length
          ? v.alternatives.map((a) => row(a, false))
          : undefined,
      },
    ])
  )
}

function component(c: ComponentView): Record<string, unknown> {
  return {
    id: c.id,
    type: c.type,
    name: c.name ?? undefined,
    draft: c.draft || undefined,
    values: values(c.values),
    children: c.children.length ? c.children.map(component) : undefined,
  }
}

// The day the user names, through its end (UTC).
function endOfDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d
}

export function registerReadTools(
  server: McpServer,
  prisma: PrismaClient,
  userId: string
) {
  server.registerTool(
    'list_houses',
    {
      title: 'List houses',
      description:
        'All of the user’s houses with status, sale status, price, key figures, open drafts and flaggedRisks: the number of risk constructions, older electrical systems and radon above 200 Bq/m3 together (get_house lists them). ' +
        'Price is final_price_sek, else highest_bid_sek, else asking_price_sek, and price.kind says which. ' +
        'Optionally filter on features (pool, sauna, deck, sunroom, garage, wood_stove, heat_pump_air_air, basement, or any component type): ' +
        'a house is left out only when a feature is known to be absent; houses where a feature is unknown come back separately under "unknown". ' +
        'maintenanceDebt and maintenanceAdjustedPrice (price + debt) are the typical figures; forecast and compare give their ranges.',
      inputSchema: z.object({
        status: z
          .array(z.enum(['CANDIDATE', 'DECLINED', 'PURCHASED', 'SOLD']))
          .optional()
          .describe('Only houses with these statuses. Default: all.'),
        features: z
          .array(z.string())
          .optional()
          .describe('Features the house must have, e.g. ["garage", "sauna"].'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ status, features }) => {
      if (features?.length) {
        const known = new Set([
          ...FEATURES,
          ...(
            await prisma.componentType.findMany({ select: { type: true } })
          ).map((t) => t.type),
        ])
        const unknownNames = features.filter((f) => !known.has(f))
        if (unknownNames.length)
          return toolError(
            `Unknown features: ${unknownNames.join(', ')}. Use a component type from type_library or "basement".`
          )
      }

      const houses = await prisma.house.findMany({
        where: { ownerId: userId, ...(status && { status: { in: status } }) },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
      const analyses = (
        await Promise.all(
          houses.map((h) =>
            analyseHouse(prisma, { ownerId: userId, houseId: h.id })
          )
        )
      ).filter((a): a is Analysis => a !== null)

      const matching = []
      const unknown = []
      let excluded = 0
      for (const analysis of analyses) {
        const { view } = analysis
        const answers = (features ?? []).map((f) => ({
          feature: f,
          answer: featureAnswer(f, view.components, view.values),
        }))
        if (answers.some((a) => a.answer === 'no')) excluded++
        else if (answers.some((a) => a.answer === 'unknown'))
          unknown.push({
            ...listSummary(analysis),
            unknownFeatures: answers
              .filter((a) => a.answer === 'unknown')
              .map((a) => a.feature),
          })
        else matching.push(listSummary(analysis))
      }
      return result({ houses: matching, unknown, excludedCount: excluded })
    }
  )

  server.registerTool(
    'get_house',
    {
      title: 'Get house',
      description:
        'Everything approved about one house: current values with source, confidence, document and quote, and alternative values reported for the same key; ' +
        'the component tree; features (yes, no or unknown; unknown is not no); heating; bathroom count; flagged risk constructions, older electrical systems and radon above 200 Bq/m3; ' +
        'area statistics with level and year (a municipal figure is not the neighbourhood’s); actions from inspections; documents; and open drafts awaiting approval, whose rows are not included. ' +
        'With draftId, the open draft is shown together with the approved data and its rows carry draft: true, so you can tell the user what approving it would add. ' +
        'With asOf, the house as it stood at the end of that day, e.g. before an inspection.',
      inputSchema: z.object({
        houseId: z.uuid().describe('The house id from list_houses.'),
        draftId: z
          .uuid()
          .optional()
          .describe('An open draft of the house to include, marked draft.'),
        asOf: z.iso
          .date()
          .optional()
          .describe('ISO date, e.g. 2026-10-22. Default: now.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ houseId, draftId, asOf }) => {
      const view = await getHouse(prisma, {
        ownerId: userId,
        houseId,
        draftId,
        asOf: asOf ? endOfDay(asOf) : undefined,
      })
      if (!view) return toolError(`No house with id ${houseId}.`)

      return result({
        house: {
          id: view.id,
          address: view.address,
          propertyDesignation: view.propertyDesignation,
          municipality: view.municipality,
          status: view.status,
        },
        asOf: asOf ?? null,
        draftId: view.preview,
        price: pickPrice(view.values),
        values: values(view.values),
        components: view.components.map(component),
        features: Object.fromEntries(
          FEATURES.map((f) => [
            f,
            featureAnswer(f, view.components, view.values),
          ])
        ),
        bathrooms: bathroomCount(view.components),
        heating: heating(view.components),
        risks: risks(view.components, view.values),
        area: await areaStatistics(prisma, houseAreas(view)),
        workItems: view.workItems.map((w) => ({
          id: w.id,
          componentId: w.componentId ?? undefined,
          kind: w.kind,
          severity: w.severity ?? undefined,
          description: w.description,
          yearMin: w.yearMin ?? undefined,
          yearMax: w.yearMax ?? undefined,
          costLowSek: w.costLowSek ?? undefined,
          costHighSek: w.costHighSek ?? undefined,
          documentId: w.documentId ?? undefined,
          quote: w.quote ?? undefined,
          draft: w.draft || undefined,
        })),
        documents: view.documents.map((d) => ({
          id: d.id,
          type: d.type,
          title: d.title,
          sourceUrl: d.sourceUrl ?? undefined,
          filename: d.filename ?? undefined,
          date: d.documentDate?.toISOString().slice(0, 10),
        })),
        openDrafts: view.drafts.map((d) => ({
          id: d.id,
          comment: d.comment,
          createdAt: d.createdAt.toISOString(),
          ...d.counts,
        })),
      })
    }
  )

  server.registerTool(
    'type_library',
    {
      title: 'Type library',
      description:
        'The component types Husvan knows and the attributes to look for in each, with datatype, unit and choice options, plus the keys to look for on the house itself. ' +
        'Read it before turning a listing, inspection report or energy certificate into components and values. ' +
        'The schema says what to look for; a value outside it may still be stored.',
      inputSchema: z.object({
        types: z
          .array(z.string())
          .optional()
          .describe('Only these component types. Default: all.'),
        category: z
          .string()
          .optional()
          .describe(
            'Only this category: envelope, heating, ventilation, plumbing, electrical, interior or feature.'
          ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ types, category }) => {
      const [rows, profiles] = await Promise.all([
        prisma.componentType.findMany({
          where: {
            ...(types?.length && { type: { in: types } }),
            ...(category && { category }),
          },
          orderBy: [{ category: 'asc' }, { type: 'asc' }],
        }),
        prisma.lifespanProfile.findMany({
          select: { type: true, match: true },
        }),
      ])
      return result({
        conventions: [
          'Keys and type names are English snake_case.',
          'Shared keys the forecast reads: installation_year, condition (1 to 5, 5 is new), area (m2), length (m), quantity.',
          'A component without installation_year uses the house’s construction_year.',
          'A replaced part is a new component with replacesId pointing at the old one; the old row is never changed.',
          'Windows one by one when the documents allow it, otherwise one window component with quantity.',
          'One sewer_pipes component per section (indoor, under_slab, ground).',
          'A listing that says "2 badrum" becomes two bathroom components.',
          'Only a document that says something is missing makes it absent (absent_features); not mentioned is unknown.',
        ],
        houseKeys: HOUSE_KEYS,
        componentTypes: rows.map((t) => ({
          type: t.type,
          label: t.label,
          category: t.category,
          attributes: t.attributeSchema,
          allowedSubcomponents: t.allowedSubcomponents,
          // Types without a profile are shown and compared but cost nothing.
          lifespanProfiles: profiles
            .filter((p) => p.type === t.type)
            .map((p) => p.match),
        })),
      })
    }
  )
}
