import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Container, Paper, Typography } from '@mui/material'
import LoginForm from './LoginForm'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('login')
  return { title: t('title'), robots: { index: false } }
}

export default async function LoginPage() {
  const t = await getTranslations('login')
  return (
    <Container maxWidth="xs" sx={{ py: 8 }}>
      <Paper sx={{ p: 4 }}>
        <Typography component="h1" variant="h5" gutterBottom>
          {t('title')}
        </Typography>
        <LoginForm />
      </Paper>
    </Container>
  )
}
