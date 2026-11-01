import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Container } from '@mui/material'
import { auth } from '@/lib/auth'
import HouseDetail from './HouseDetail'
import { houseTab } from './tabs'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('houses')
  return { title: t('title'), robots: { index: false } }
}

export default async function HousePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ draft?: string; tab?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')

  const { id } = await params
  const { draft, tab } = await searchParams
  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <HouseDetail id={id} draftId={draft} tab={houseTab(tab)} />
    </Container>
  )
}
