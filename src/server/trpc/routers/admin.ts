import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  allowEmail,
  listAllowedEmails,
  revokeEmail,
} from '@/server/users/allowlist'
import {
  MAX_ACCOUNTS_PER_DAY,
  setSignupSettings,
  signupState,
} from '@/server/users/signup'
import { adminProcedure, createTRPCRouter } from '../trpc'

export const adminRouter = createTRPCRouter({
  signup: adminProcedure.query(({ ctx }) => signupState(ctx.prisma)),

  setSignup: adminProcedure
    .input(
      z.object({
        open: z.boolean(),
        accountsPerDay: z.number().int().min(0).max(MAX_ACCOUNTS_PER_DAY),
      })
    )
    .mutation(({ ctx, input }) => setSignupSettings(ctx.prisma, input)),

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
