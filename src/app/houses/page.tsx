import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Container, Typography } from '@mui/material'
import { auth } from '@/lib/auth'
import HouseList from './HouseList'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('houses')
  return { title: t('title'), robots: { index: false } }
}

export default async function HousesPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')

  const t = await getTranslations('houses')
  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Typography component="h1" variant="h4" gutterBottom>
        {t('title')}
      </Typography>
      <HouseList />
    </Container>
  )
}
