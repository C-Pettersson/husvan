import { Suspense } from 'react'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Container, Typography } from '@mui/material'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { listHouses } from '@/server/houses/listHouses'
import { FreshHouseList, StoredHouseList } from './HouseList'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('houses')
  return { title: t('title'), robots: { index: false } }
}

export default async function HousesPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')

  // Not awaited: the page goes out at once with the list from the last
  // visit, and the fresh list follows in the same response.
  const houses = listHouses(prisma, session.user.id).catch((error) => {
    console.error('[houses]', error)
    return null
  })
  const t = await getTranslations('houses')
  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Typography component="h1" variant="h4" gutterBottom>
        {t('title')}
      </Typography>
      <Suspense fallback={<StoredHouseList />}>
        <FreshHouseList houses={houses} />
      </Suspense>
    </Container>
  )
}
