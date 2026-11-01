import { TRPCError } from '@trpc/server'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import {
  compareHouses,
  costSummary,
  debtRangesByType,
  features,
  listSummary,
} from '@/server/forecast/compare'
import { analyseHouse, type Analysis } from '@/server/forecast/run'
import { areaStatistics, houseAreas } from '@/server/houses/area'
import {
  answerAsUser,
  answerInput,
  undoAnswer,
} from '@/server/houses/answerQuestions'
import { assumptionShape, setAssumptions } from '@/server/houses/assumptions'
import { valueInput, workItemInput } from '@/server/houses/changes'
import { confirmChangeset } from '@/server/houses/confirmChangeset'
import { correct, retract, updateCore } from '@/server/houses/correct'
import { bathroomCount, heating, valueOf } from '@/server/houses/derive'
import { getHouse, type Label } from '@/server/houses/getHouse'
import type { AttributeDefinition } from '@/server/library/schema'
import { HOUSE_KEYS } from '@/server/library/houseKeys'
import { createTRPCRouter, protectedProcedure } from '../trpc'

const notFound = () => new TRPCError({ code: 'NOT_FOUND' })

// Validation errors go back as the message, one per line, so the form can
// show what the library refused.
const refused = (errors: string[]) =>
  new TRPCError({ code: 'BAD_REQUEST', message: errors.join('\n') })

// A value the user enters is certain.
const userValue = valueInput
  .pick({ key: true, value: true, unit: true })
  .transform((v) => ({ ...v, confidence: 1 }))

// Every type's label and attributes, for naming parts and their values.
async function typeLabels(prisma: PrismaClient) {
  const types = await prisma.componentType.findMany({
    select: { type: true, label: true, attributeSchema: true },
  })
  return Object.fromEntries(
    types.map((t) => [
      t.type,
      {
        label: t.label as Label,
        attributeSchema: t.attributeSchema as Record<
          string,
          AttributeDefinition
        >,
      },
    ])
  )
}

export const houseRouter = createTRPCRouter({
  // Every house with price, maintenance debt and adjusted price, and the
  // features the list filters on.
  list: protectedProcedure.query(async ({ ctx }) => {
    const houses = await ctx.prisma.house.findMany({
      where: { ownerId: ctx.user.id },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    })
    const analyses = await Promise.all(
      houses.map((h) =>
        analyseHouse(ctx.prisma, { ownerId: ctx.user.id, houseId: h.id })
      )
    )
    return analyses
      .filter((a): a is Analysis => a !== null)
      .map((a) => ({
        ...listSummary(a),
        maintenanceDebt: a.debt.total,
        maintenanceAdjustedPrice: a.adjustedPrice,
        features: features(a),
        inspected: a.gaps.inspected,
      }))
  }),

  // One house as approved, or with one of its drafts shown in place.
  get: protectedProcedure
    .input(z.object({ id: z.uuid(), draftId: z.uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const house = await getHouse(ctx.prisma, {
        ownerId: ctx.user.id,
        houseId: input.id,
        draftId: input.draftId,
      })
      if (!house) throw notFound()
      return { ...house, houseKeys: HOUSE_KEYS }
    }),

  // What the house costs: the forecast, the debt and what they leave out,
  // with features, risks and the area. Not saved; the forecast tool saves.
  analysis: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const a = await analyseHouse(ctx.prisma, {
        ownerId: ctx.user.id,
        houseId: input.id,
      })
      if (!a) throw notFound()
      return {
        ...costSummary(a),
        forecast: a.forecast,
        debtByType: debtRangesByType(a),
        annual: a.annual,
        runningCostsKnown: a.runningCostsKnown,
        assumptions: a.assumptions,
        risks: a.risks,
        flags: a.flags,
        priceIndexYear: a.indexYear,
        features: features(a),
        heating: heating(a.view.components),
        bathrooms: bathroomCount(a.view.components),
        area: await areaStatistics(ctx.prisma, houseAreas(a.view)),
        // Labels for every type, since assumed parts are not in the house.
        types: await typeLabels(ctx.prisma),
      }
    }),

  // What the analysis does not know yet and how much each answer could
  // move it, as the open_questions tool gives it.
  questions: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const a = await analyseHouse(ctx.prisma, {
        ownerId: ctx.user.id,
        houseId: input.id,
      })
      if (!a) throw notFound()
      return {
        ...a.openQuestions(),
        horizonYears: a.forecast.horizonYears,
        constructionYear: valueOf(a.view.values, 'construction_year') ?? null,
        types: await typeLabels(ctx.prisma),
      }
    }),

  // One answer the user gives to an open question, approved at once.
  answerQuestion: protectedProcedure
    .input(z.object({ houseId: z.uuid(), answer: answerInput }))
    .mutation(async ({ ctx, input }) => {
      const r = await answerAsUser(ctx.prisma, {
        ownerId: ctx.user.id,
        houseId: input.houseId,
        answers: [input.answer],
      })
      if (!r.ok) throw refused(r.errors)
      return r
    }),

  // Takes back an answer the user gave on the web.
  undoAnswer: protectedProcedure
    .input(z.object({ houseId: z.uuid(), changesetId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const r = await undoAnswer(ctx.prisma, {
        ownerId: ctx.user.id,
        ...input,
      })
      if (!r.ok && r.error === 'not_found') throw notFound()
      if (!r.ok) throw new TRPCError({ code: 'CONFLICT', message: r.error })
      return r
    }),

  compare: protectedProcedure
    .input(z.object({ ids: z.array(z.uuid()).min(2).max(6) }))
    .query(async ({ ctx, input }) => {
      const c = await compareHouses(ctx.prisma, {
        ownerId: ctx.user.id,
        houseIds: input.ids,
      })
      if (!c.ok) throw notFound()
      return { ...c, types: await typeLabels(ctx.prisma) }
    }),

  confirmDraft: protectedProcedure
    .input(
      z.object({
        changesetId: z.uuid(),
        decision: z.enum(['approve', 'reject']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const status = await confirmChangeset(ctx.prisma, {
        ownerId: ctx.user.id,
        ...input,
      })
      // Not a draft of this owner's, or already decided.
      if (!status) throw notFound()
      return { status }
    }),

  // A value the user sets on the house or on one of its components.
  setValue: protectedProcedure
    .input(
      z.object({
        houseId: z.uuid(),
        componentId: z.uuid().optional(),
        value: userValue,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const r = await correct(ctx.prisma, {
        ownerId: ctx.user.id,
        houseId: input.houseId,
        input: {
          houseValues: input.componentId ? [] : [input.value],
          components: [],
          componentValues: input.componentId
            ? [{ componentId: input.componentId, values: [input.value] }]
            : [],
          workItems: [],
        },
      })
      if (!r.ok) throw refused(r.errors)
      return r
    }),

  // A work item the user adds, or one they restate with replaces.
  setWorkItem: protectedProcedure
    .input(
      z.object({
        houseId: z.uuid(),
        workItem: workItemInput.omit({ documentId: true, quote: true }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const r = await correct(ctx.prisma, {
        ownerId: ctx.user.id,
        houseId: input.houseId,
        input: {
          houseValues: [],
          components: [],
          componentValues: [],
          workItems: [input.workItem],
        },
      })
      if (!r.ok) throw refused(r.errors)
      return r
    }),

  retract: protectedProcedure
    .input(
      z.union([
        z.object({ houseId: z.uuid(), observationId: z.uuid() }),
        z.object({ houseId: z.uuid(), workItemId: z.uuid() }),
      ])
    )
    .mutation(async ({ ctx, input }) => {
      if (!(await retract(ctx.prisma, { ownerId: ctx.user.id, ...input })))
        throw notFound()
      return { ok: true }
    }),

  updateCore: protectedProcedure
    .input(
      z.object({
        houseId: z.uuid(),
        address: z.string().trim().min(1).max(200).optional(),
        propertyDesignation: z.string().trim().max(100).nullable().optional(),
        municipalityCode: z.string().nullable().optional(),
        status: z
          .enum(['CANDIDATE', 'DECLINED', 'PURCHASED', 'SOLD'])
          .optional(),
      })
    )
    .mutation(async ({ ctx, input: { houseId, ...core } }) => {
      const r = await updateCore(ctx.prisma, {
        ownerId: ctx.user.id,
        houseId,
        core,
      })
      if (!r.ok) throw refused(r.errors)
      return r
    }),

  municipalities: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.municipality.findMany({
      select: { code: true, name: true },
      orderBy: { name: 'asc' },
    })
  ),

  // The user's own forecast assumptions for one house, or for all houses
  // without houseId. Newest wins; nothing is overwritten.
  setAssumptions: protectedProcedure
    .input(
      z.object({
        houseId: z.uuid().optional(),
        values: z.object(assumptionShape).partial(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const r = await setAssumptions(ctx.prisma, {
        ownerId: ctx.user.id,
        houseId: input.houseId,
        values: input.values,
      })
      if (!r.ok) throw refused([r.error])
      return r
    }),
})
