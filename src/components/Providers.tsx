'use client'

import { ReactNode, useMemo, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { TRPCClientError } from '@trpc/client'
import { createTRPCClient, trpc } from '@/lib/trpc'
import { createAppTheme } from '@/lib/theme'
import type { Locale } from '@/i18n/locales'

export default function Providers({
  locale,
  children,
}: {
  locale: Locale
  children: ReactNode
}) {
  const theme = useMemo(() => createAppTheme(locale), [locale])
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) =>
              !(
                error instanceof TRPCClientError &&
                error.data?.code === 'UNAUTHORIZED'
              ) && failureCount < 2,
          },
        },
      })
  )
  const [trpcClient] = useState(() => createTRPCClient())

  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </trpc.Provider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  )
}
