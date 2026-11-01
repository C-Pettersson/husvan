'use client'

import NextLink from 'next/link'
import { createTheme } from '@mui/material/styles'
import { enUS, svSE } from '@mui/material/locale'
import type { Locale } from '@/i18n/locales'

export function createAppTheme(locale: Locale) {
  return createTheme(
    {
      // Buttons and links with href navigate client-side. Server components
      // can then pass a plain href instead of component={NextLink}.
      components: {
        MuiButtonBase: { defaultProps: { LinkComponent: NextLink } },
        MuiLink: { defaultProps: { component: NextLink } },
      },
      palette: {
        primary: { main: '#2f5d50' },
        secondary: { main: '#b5663c' },
        background: { default: '#f7f5f0' },
      },
      shape: { borderRadius: 8 },
      typography: {
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      },
    },
    locale === 'sv' ? svSE : enUS
  )
}
