import { createTRPCRouter } from './trpc'
import { houseRouter } from './routers/house'

export const appRouter = createTRPCRouter({
  house: houseRouter,
})

export type AppRouter = typeof appRouter
