import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { AppBar, Box, Button, Toolbar } from '@mui/material'
import { auth } from '@/lib/auth'
import LanguageSwitch from './LanguageSwitch'
import SignOutButton from './SignOutButton'

export default async function AppHeader() {
  const t = await getTranslations('nav')
  const session = await auth.api.getSession({ headers: await headers() })

  return (
    <AppBar position="static" color="default" elevation={0}>
      <Toolbar sx={{ gap: 2 }}>
        <Button
          href="/"
          color="inherit"
          sx={{ fontSize: '1.25rem', fontWeight: 700, textTransform: 'none' }}
        >
          Husvan
        </Button>
        {session && (
          <Button href="/houses" color="inherit">
            {t('houses')}
          </Button>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <LanguageSwitch />
        {session ? (
          <SignOutButton />
        ) : (
          <Button href="/login" color="inherit">
            {t('signIn')}
          </Button>
        )}
      </Toolbar>
    </AppBar>
  )
}
