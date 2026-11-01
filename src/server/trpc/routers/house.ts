import { createTRPCRouter, protectedProcedure } from '../trpc'

export const houseRouter = createTRPCRouter({
  // The core of each house only. Current values, drafts and prices come with
  // the read tools in milestone 3.
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.house.findMany({
      where: { ownerId: ctx.user.id },
      select: { id: true, address: true, status: true },
      orderBy: { createdAt: 'desc' },
    })
  ),
})
