import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Container, Link, Paper, Typography } from '@mui/material'
import LoginForm from './LoginForm'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('login')
  return { title: t('title'), robots: { index: false } }
}

export default async function LoginPage() {
  const t = await getTranslations('login')
  // The site key is public and read at request time, so the image built by
  // GitHub Actions needs no knowledge of it.
  const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY?.trim() || null
  return (
    <Container maxWidth="xs" sx={{ py: 8 }}>
      <Paper sx={{ p: 4 }}>
        <Typography component="h1" variant="h5" gutterBottom>
          {t('title')}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {t('intro')}
        </Typography>
        <Suspense>
          <LoginForm turnstileSiteKey={turnstileSiteKey} />
        </Suspense>
        <Typography variant="body2" sx={{ mt: 3 }}>
          <Link href="/privacy">{t('privacy')}</Link>
        </Typography>
      </Paper>
    </Container>
  )
}
