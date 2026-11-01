import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function createTRPCContext({ req }: { req: Request }) {
  const session = await auth.api.getSession({ headers: req.headers })
  return { session, prisma }
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>

const t = initTRPC.context<TRPCContext>().create({ transformer: superjson })

export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, user: ctx.session.user } })
})
