import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  allowEmail,
  listAllowedEmails,
  revokeEmail,
} from '@/server/users/allowlist'
import { adminProcedure, createTRPCRouter } from '../trpc'

export const adminRouter = createTRPCRouter({
  allowedEmails: adminProcedure.query(({ ctx }) =>
    listAllowedEmails(ctx.prisma)
  ),

  allowEmail: adminProcedure
    .input(z.object({ email: z.email() }))
    .mutation(async ({ ctx, input }) => {
      await allowEmail(ctx.prisma, {
        email: input.email,
        addedById: ctx.user.id,
      })
    }),

  revokeEmail: adminProcedure
    .input(z.object({ email: z.email() }))
    .mutation(async ({ ctx, input }) => {
      const result = await revokeEmail(ctx.prisma, {
        email: input.email,
        actorId: ctx.user.id,
      })
      if (result === 'is_self') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'is_self' })
      }
      if (result === 'not_found') throw new TRPCError({ code: 'NOT_FOUND' })
    }),
})
