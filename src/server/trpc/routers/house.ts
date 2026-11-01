import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { confirmChangeset } from '@/server/houses/confirmChangeset'
import { getHouse } from '@/server/houses/getHouse'
import { createTRPCRouter, protectedProcedure } from '../trpc'

export const houseRouter = createTRPCRouter({
  // The core of each house only. Prices and key figures come with the
  // forecast in milestone 5.
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.house.findMany({
      where: { ownerId: ctx.user.id },
      select: { id: true, address: true, status: true },
      orderBy: { createdAt: 'desc' },
    })
  ),

  // One house as approved, or with one of its drafts shown in place.
  get: protectedProcedure
    .input(z.object({ id: z.uuid(), draftId: z.uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const house = await getHouse(ctx.prisma, {
        ownerId: ctx.user.id,
        houseId: input.id,
        draftId: input.draftId,
      })
      if (!house) throw new TRPCError({ code: 'NOT_FOUND' })
      return house
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
      if (!status) throw new TRPCError({ code: 'NOT_FOUND' })
      return { status }
    }),
})
