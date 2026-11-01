// Read tools (CLAUDE.md, "MCP-verktyg i version 1"): list_houses, get_house
// and type_library. Descriptions and answers are in English; Claude answers
// the user in Swedish. Only approved data is returned; open drafts are
// listed, not mixed in.
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'
import type { PrismaClient } from '@prisma/client'
import { areaStatistics, type AreaRef } from '@/server/houses/area'
import {
  FEATURES,
  bathroomCount,
  featureAnswer,
  heating,
  pickPrice,
  risks,
  valueOf,
} from '@/server/houses/derive'
import {
  getHouse,
  type ComponentView,
  type HouseView,
  type KeyValueView,
  type ValueRow,
} from '@/server/houses/getHouse'
import { HOUSE_KEYS } from '@/server/library/houseKeys'

type View = NonNullable<HouseView>

function result(value: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  }
}

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}

const row = (r: ValueRow, withQuote: boolean) => ({
  value: r.value,
  unit: r.unit ?? undefined,
  source: r.source,
  confidence: r.confidence,
  documentId: r.documentId ?? undefined,
  quote: withQuote ? (r.quote ?? undefined) : undefined,
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
    values: values(c.values),
    children: c.children.length ? c.children.map(component) : undefined,
  }
}

const KEY_FIGURES = [
  'living_area',
  'secondary_area',
  'plot_area',
  'construction_year',
  'room_count',
  'energy_class',
]

function summary(view: View) {
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
    // Risk constructions and older electrical systems together.
    flaggedRisks: risks(view.components).length,
    openDrafts: view.drafts.length,
  }
}

function areasOf(view: View): AreaRef[] {
  const areas: AreaRef[] = []
  const deso = valueOf(view.values, 'deso_code')
  if (typeof deso === 'string') areas.push({ level: 'DESO', code: deso })
  const police = valueOf(view.values, 'police_area_code')
  if (typeof police === 'string')
    areas.push({ level: 'POLICE_AREA', code: police })
  if (view.municipality)
    areas.push({ level: 'MUNICIPALITY', code: view.municipality.code })
  areas.push({ level: 'NATION', code: 'SE' })
  return areas
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
        'All of the user’s houses with status, sale status, price, key figures, open drafts and flaggedRisks: the number of risk constructions and older electrical systems together (get_house lists them). ' +
        'Price is final_price_sek, else highest_bid_sek, else asking_price_sek, and price.kind says which. ' +
        'Optionally filter on features (pool, sauna, deck, sunroom, garage, wood_stove, heat_pump_air_air, basement, or any component type): ' +
        'a house is left out only when a feature is known to be absent; houses where a feature is unknown come back separately under "unknown". ' +
        'Maintenance debt and maintenance-adjusted price arrive with the forecast tools.',
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
      const views = (
        await Promise.all(
          houses.map((h) =>
            getHouse(prisma, { ownerId: userId, houseId: h.id })
          )
        )
      ).filter((v): v is View => v !== null)

      const matching = []
      const unknown = []
      let excluded = 0
      for (const view of views) {
        const answers = (features ?? []).map((f) => ({
          feature: f,
          answer: featureAnswer(f, view.components, view.values),
        }))
        if (answers.some((a) => a.answer === 'no')) excluded++
        else if (answers.some((a) => a.answer === 'unknown'))
          unknown.push({
            ...summary(view),
            unknownFeatures: answers
              .filter((a) => a.answer === 'unknown')
              .map((a) => a.feature),
          })
        else matching.push(summary(view))
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
        'the component tree; features (yes, no or unknown; unknown is not no); heating; bathroom count; flagged risk constructions and older electrical systems; ' +
        'area statistics with level and year (a municipal figure is not the neighbourhood’s); actions from inspections; documents; and open drafts awaiting approval, whose rows are not included. ' +
        'With asOf, the house as it stood at the end of that day, e.g. before an inspection.',
      inputSchema: z.object({
        houseId: z.uuid().describe('The house id from list_houses.'),
        asOf: z.iso
          .date()
          .optional()
          .describe('ISO date, e.g. 2026-10-22. Default: now.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ houseId, asOf }) => {
      const view = await getHouse(prisma, {
        ownerId: userId,
        houseId,
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
        risks: risks(view.components),
        area: await areaStatistics(prisma, areasOf(view)),
        workItems: view.workItems.map((w) => ({
          id: w.id,
          componentId: w.componentId ?? undefined,
          kind: w.kind,
          description: w.description,
          yearMin: w.yearMin ?? undefined,
          yearMax: w.yearMax ?? undefined,
          costLowSek: w.costLowSek ?? undefined,
          costHighSek: w.costHighSek ?? undefined,
          documentId: w.documentId ?? undefined,
          quote: w.quote ?? undefined,
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
