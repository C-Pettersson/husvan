import { getTranslations } from 'next-intl/server'
import { AppBar, Box, Button, Toolbar } from '@mui/material'
import { getSession } from '@/lib/session'
import LanguageSwitch from './LanguageSwitch'
import Logo from './Logo'
import NavMenu, { type NavLink } from './NavMenu'
import SignOutButton from './SignOutButton'

export default async function AppHeader() {
  const t = await getTranslations('nav')
  const session = await getSession()

  const mainLinks: NavLink[] = session
    ? [
        { href: '/houses', label: t('houses') },
        { href: '/getting-started', label: t('gettingStarted') },
        ...(session.user.role === 'ADMIN'
          ? [{ href: '/admin', label: t('users') }]
          : []),
      ]
    : []
  const profileLink: NavLink = { href: '/profile', label: t('profile') }

  // Below md the signed-in links do not fit in one row, so they move into a
  // menu button and the bar keeps only the logo and the language switch.
  const wide = { display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 2 }
  const narrow = { display: { xs: 'flex', md: 'none' } }

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
          '& .MuiButton-root': { whiteSpace: 'nowrap', minHeight: 44 },
          '& .MuiToggleButton-root': { minHeight: 44, minWidth: 44 },
        }}
      >
        <Button href="/" color="inherit" sx={{ textTransform: 'none', ml: -1 }}>
          <Logo />
        </Button>
        {session && (
          <Box sx={wide}>
            {mainLinks.map((link) => (
              <Button key={link.href} href={link.href} color="inherit">
                {link.label}
              </Button>
            ))}
          </Box>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <LanguageSwitch />
        {session ? (
          <>
            <Box sx={wide}>
              <Button href={profileLink.href} color="inherit">
                {profileLink.label}
              </Button>
              <SignOutButton />
            </Box>
            <Box sx={narrow}>
              <NavMenu links={[...mainLinks, profileLink]} />
            </Box>
          </>
        ) : (
          <Button href="/login" color="inherit">
            {t('signIn')}
          </Button>
        )}
      </Toolbar>
    </AppBar>
  )
}
