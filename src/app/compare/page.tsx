import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Container, Typography } from '@mui/material'
import { auth } from '@/lib/auth'
import Comparison from './Comparison'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('compare')
  return { title: t('title'), robots: { index: false } }
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')

  const t = await getTranslations('compare')
  const ids = [...new Set((await searchParams).ids?.split(',') ?? [])].filter(
    Boolean
  )
  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      <Typography component="h1" variant="h4" gutterBottom>
        {t('title')}
      </Typography>
      {ids.length >= 2 && ids.length <= 6 ? (
        <Comparison ids={ids} />
      ) : (
        <Typography color="text.secondary">{t('pick')}</Typography>
      )}
    </Container>
  )
}
