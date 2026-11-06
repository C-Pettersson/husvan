import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Alert, Container, Paper, Typography } from '@mui/material'
import prisma from '@/lib/prisma'
import { signupState } from '@/server/users/signup'
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
  // Said to everyone, not per address: telling only the new address that signup
  // is paused would reveal which addresses have an account.
  const { status } = await signupState(prisma)
  return (
    <Container maxWidth="xs" sx={{ py: 8 }}>
      <Paper sx={{ p: 4 }}>
        <Typography component="h1" variant="h5" gutterBottom>
          {t('title')}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {status === 'open' ? t('introOpen') : t('intro')}
        </Typography>
        {status === 'paused' && (
          <Alert severity="info" sx={{ mb: 3 }}>
            {t('signupPaused')}
          </Alert>
        )}
        <Suspense>
          <LoginForm turnstileSiteKey={turnstileSiteKey} />
        </Suspense>
      </Paper>
    </Container>
  )
}
