import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Box, Button, Container, Paper, Stack, Typography } from '@mui/material'
import { auth } from '@/lib/auth'
import { getMcpResource } from '@/lib/siteUrl'
import CopyUrl from './CopyUrl'

const STEPS = ['open', 'address', 'auth', 'signIn', 'enable', 'try'] as const
const NOTES = ['team', 'free', 'mobile', 'sameBrowser', 'claudeCode', 'labels']

const b = (chunks: ReactNode) => <strong>{chunks}</strong>

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('gettingStarted')
  return { title: t('title'), robots: { index: false } }
}

// How to add Husvan as a custom connector in Claude. The labels in the steps
// follow Anthropic's help article on custom connectors; check them against it
// when Claude's menus change.
export default async function GettingStartedPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')

  const t = await getTranslations('gettingStarted')
  const consent = await getTranslations('consent')
  const values = { b, allow: consent('allow'), email: session.user.email }

  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Typography component="h1" variant="h4" gutterBottom>
        {t('title')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        {t('intro')}
      </Typography>

      <Stack component="ol" spacing={2} sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {STEPS.map((step, i) => (
          <Paper
            key={step}
            component="li"
            variant="outlined"
            sx={{ p: 2.5, display: 'flex', gap: 2 }}
          >
            <Box
              aria-hidden
              sx={{
                flex: '0 0 auto',
                width: 32,
                height: 32,
                borderRadius: '50%',
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
              }}
            >
              {i + 1}
            </Box>
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                {t(`steps.${step}.title`)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t.rich(`steps.${step}.body`, values)}
              </Typography>
              {step === 'open' && (
                <Button
                  href="https://claude.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="outlined"
                  size="small"
                  sx={{ mt: 1.5 }}
                >
                  {t('openClaude')}
                </Button>
              )}
              {step === 'address' && <CopyUrl url={getMcpResource()} />}
              {step === 'try' && (
                <Button
                  href="/houses"
                  variant="outlined"
                  size="small"
                  sx={{ mt: 1.5 }}
                >
                  {t('toHouses')}
                </Button>
              )}
            </Box>
          </Paper>
        ))}
      </Stack>

      <Typography component="h2" variant="h5" sx={{ mt: 5, mb: 2 }}>
        {t('notesTitle')}
      </Typography>
      <Stack component="ul" spacing={1.5} sx={{ pl: 2.5, m: 0 }}>
        {NOTES.map((note) => (
          <Typography key={note} component="li" variant="body2">
            {t.rich(`notes.${note}`, values)}
          </Typography>
        ))}
      </Stack>
    </Container>
  )
}
