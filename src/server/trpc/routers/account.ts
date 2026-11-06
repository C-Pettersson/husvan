import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { normaliseEmail } from '@/server/users/allowlist'
import { deleteAccount } from '@/server/users/deleteAccount'
import { createTRPCRouter, protectedProcedure } from '../trpc'

export const accountRouter = createTRPCRouter({
  updateName: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { name: input.name },
      })
    }),

  // The user types their address to confirm; the page cannot do this by mistake.
  delete: protectedProcedure
    .input(z.object({ confirmEmail: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (normaliseEmail(input.confirmEmail) !== normaliseEmail(ctx.user.email))
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'confirmation' })

      const result = await deleteAccount(ctx.prisma, { userId: ctx.user.id })
      if (result === 'last_admin')
        throw new TRPCError({ code: 'FORBIDDEN', message: 'last_admin' })
      if (result === 'storage_failed')
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'storage_failed',
        })
      if (result === 'not_found') throw new TRPCError({ code: 'NOT_FOUND' })
    }),
})
