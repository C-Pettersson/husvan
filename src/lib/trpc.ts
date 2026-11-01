import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/server/trpc/router'

export const trpc = createTRPCReact<AppRouter>()

export function createTRPCClient() {
  return trpc.createClient({
    links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
  })
}

export type RouterOutputs = inferRouterOutputs<AppRouter>
