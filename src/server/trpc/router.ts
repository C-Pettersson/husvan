import { createTRPCRouter } from './trpc'
import { accountRouter } from './routers/account'
import { adminRouter } from './routers/admin'
import { houseRouter } from './routers/house'

export const appRouter = createTRPCRouter({
  account: accountRouter,
  admin: adminRouter,
  house: houseRouter,
})

export type AppRouter = typeof appRouter
