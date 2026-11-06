import { getTranslations } from 'next-intl/server'
import { AppBar, Box, Button, Toolbar } from '@mui/material'
import { getSession } from '@/lib/session'
import LanguageSwitch from './LanguageSwitch'
import Logo from './Logo'
import SignOutButton from './SignOutButton'

export default async function AppHeader() {
  const t = await getTranslations('nav')
  const session = await getSession()

  return (
    <AppBar
      position="static"
      color="default"
      elevation={0}
      sx={{
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Toolbar
        component="nav"
        aria-label={t('label')}
        sx={{
          gap: { xs: 1, sm: 2 },
          py: { xs: 1, sm: 0 },
          flexWrap: 'wrap',
          '& .MuiButton-root': { whiteSpace: 'nowrap', minHeight: 44 },
          '& .MuiToggleButton-root': { minHeight: 44, minWidth: 44 },
        }}
      >
        <Button href="/" color="inherit" sx={{ textTransform: 'none', ml: -1 }}>
          <Logo />
        </Button>
        {session && (
          <Button href="/houses" color="inherit">
            {t('houses')}
          </Button>
        )}
        {session && (
          <Button href="/getting-started" color="inherit">
            {t('gettingStarted')}
          </Button>
        )}
        {session?.user.role === 'ADMIN' && (
          <Button href="/admin" color="inherit">
            {t('users')}
          </Button>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <LanguageSwitch />
        {session && (
          <Button href="/profile" color="inherit">
            {t('profile')}
          </Button>
        )}
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
