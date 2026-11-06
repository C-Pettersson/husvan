import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { getFormatter, getTranslations } from 'next-intl/server'
import { Box, Container, Link, Stack, Typography } from '@mui/material'
import { PRIVACY_CONTACT } from '@/lib/contact'

// Change this when the text changes in substance.
const UPDATED = new Date('2026-11-06T12:00:00Z')

const SECTIONS = [
  { key: 'who' },
  { key: 'data', items: ['account', 'signIn', 'houses', 'documents'] },
  { key: 'why' },
  {
    key: 'recipients',
    items: ['hosting', 'cloudflare', 'grafana', 'claude'],
  },
  { key: 'retention' },
  {
    key: 'rights',
    items: ['access', 'rectify', 'erase', 'other', 'complaint'],
  },
  { key: 'erasure' },
  { key: 'cookies' },
] as const

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('privacy')
  return { title: t('title'), alternates: { canonical: '/privacy' } }
}

// What GDPR article 13 asks to be told. Public, so that it can be read before
// signing in.
export default async function PrivacyPage() {
  const t = await getTranslations('privacy')
  const format = await getFormatter()
  const values = {
    contact: PRIVACY_CONTACT,
    b: (chunks: ReactNode) => <b>{chunks}</b>,
    mail: (chunks: ReactNode) => (
      <Link href={`mailto:${PRIVACY_CONTACT}`}>{chunks}</Link>
    ),
    profile: (chunks: ReactNode) => <Link href="/profile">{chunks}</Link>,
    imy: (chunks: ReactNode) => (
      <Link
        href="https://www.imy.se/"
        target="_blank"
        rel="noopener noreferrer"
      >
        {chunks}
      </Link>
    ),
  }

  return (
    <Container maxWidth="md" component="main" sx={{ py: 6 }}>
      <Typography component="h1" variant="h4" gutterBottom>
        {t('title')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 1, maxWidth: '65ch' }}>
        {t('lead')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        {t('updated', {
          date: format.dateTime(UPDATED, {
            dateStyle: 'long',
            timeZone: 'UTC',
          }),
        })}
      </Typography>

      <Stack spacing={4}>
        {SECTIONS.map((section) => (
          <Box component="section" key={section.key} sx={{ maxWidth: '65ch' }}>
            <Typography component="h2" variant="h6" gutterBottom>
              {t(`${section.key}.title`)}
            </Typography>
            {'items' in section ? (
              <Stack component="ul" spacing={1} sx={{ pl: 2.5, m: 0 }}>
                {section.items.map((item) => (
                  <Typography key={item} component="li">
                    {t.rich(`${section.key}.${item}`, values)}
                  </Typography>
                ))}
              </Stack>
            ) : (
              <Typography>{t.rich(`${section.key}.body`, values)}</Typography>
            )}
          </Box>
        ))}
      </Stack>
    </Container>
  )
}
