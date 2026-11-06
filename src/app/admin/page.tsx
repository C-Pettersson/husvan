import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Container, Stack, Typography } from '@mui/material'
import { auth } from '@/lib/auth'
import AllowedEmails from './AllowedEmails'
import SignupSettings from './SignupSettings'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin')
  return { title: t('title'), robots: { index: false } }
}

export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/houses')

  const t = await getTranslations('admin')
  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Typography component="h1" variant="h4" gutterBottom>
        {t('title')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t('intro')}
      </Typography>
      <Stack spacing={3}>
        <SignupSettings />
        <AllowedEmails selfEmail={session.user.email} />
      </Stack>
    </Container>
  )
}
