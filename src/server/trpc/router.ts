import { createTRPCRouter } from './trpc'
import { adminRouter } from './routers/admin'
import { houseRouter } from './routers/house'

export const appRouter = createTRPCRouter({
  admin: adminRouter,
  house: houseRouter,
})

export type AppRouter = typeof appRouter
