import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Box, Button, Container, Link, Stack, Typography } from '@mui/material'
import { TOOL_GROUPS, TOOL_NAMES } from './toolGroups'

const NOTES = ['account', 'noDelete', 'interpretation'] as const

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('tools')
  return {
    title: t('title'),
    description: t('metaDescription'),
    alternates: { canonical: '/tools' },
  }
}

// Public, so that someone can see what Claude may read and change before
// connecting it. The texts are written for people; what Claude itself sees is
// the description in src/server/mcp/.
export default async function ToolsPage() {
  const t = await getTranslations('tools')

  return (
    <Container maxWidth="md" component="main" sx={{ py: 6 }}>
      <Typography component="h1" variant="h4" gutterBottom>
        {t('title')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 5, maxWidth: '65ch' }}>
        {t('lead', { count: TOOL_NAMES.length })}
      </Typography>

      <Stack spacing={5}>
        {TOOL_GROUPS.map((group) => (
          <Box component="section" key={group.key}>
            <Typography component="h2" variant="h6" gutterBottom>
              {t(`groups.${group.key}.title`)}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2, maxWidth: '65ch' }}>
              {t(`groups.${group.key}.body`)}
            </Typography>
            {group.tools.map((tool) => (
              <Box
                key={tool}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: 'minmax(0, 1fr)',
                    sm: '220px minmax(0, 1fr)',
                  },
                  columnGap: 3,
                  rowGap: 0.5,
                  borderTop: 1,
                  borderColor: 'divider',
                  py: 1.5,
                }}
              >
                <Box>
                  <Typography component="h3" variant="subtitle2">
                    {t(`list.${tool}.title`)}
                  </Typography>
                  <Typography
                    component="code"
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontFamily: 'monospace' }}
                  >
                    {tool}
                  </Typography>
                </Box>
                <Typography variant="body2">
                  {t(`list.${tool}.body`)}
                </Typography>
              </Box>
            ))}
          </Box>
        ))}

        <Box component="section" sx={{ maxWidth: '65ch' }}>
          <Typography component="h2" variant="h6" gutterBottom>
            {t('notes.title')}
          </Typography>
          <Stack component="ul" spacing={1} sx={{ pl: 2.5, m: 0 }}>
            {NOTES.map((note) => (
              <Typography key={note} component="li">
                {t(`notes.${note}`)}
              </Typography>
            ))}
          </Stack>
        </Box>

        <Box component="section" sx={{ maxWidth: '65ch' }}>
          <Typography sx={{ mb: 2 }}>{t('connect')}</Typography>
          <Stack
            direction="row"
            flexWrap="wrap"
            useFlexGap
            spacing={2}
            alignItems="center"
          >
            <Button
              href="/getting-started"
              variant="contained"
              disableElevation
            >
              {t('getStarted')}
            </Button>
            <Link href="/privacy">{t('privacy')}</Link>
          </Stack>
        </Box>
      </Stack>
    </Container>
  )
}
