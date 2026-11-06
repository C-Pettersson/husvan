import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getFormatter, getTranslations } from 'next-intl/server'
import {
  Button,
  Container,
  Link,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { PRIVACY_CONTACT } from '@/lib/contact'
import prisma from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { isLastAdmin } from '@/server/users/deleteAccount'
import DeleteAccount from './DeleteAccount'
import ProfileName from './ProfileName'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile')
  return { title: t('title'), robots: { index: false } }
}

// The user's own page: correct the name, take a copy of everything, erase it.
export default async function ProfilePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const t = await getTranslations('profile')
  const format = await getFormatter()
  const userId = session.user.id
  const [houses, documents, lastAdmin] = await Promise.all([
    prisma.house.count({ where: { ownerId: userId } }),
    prisma.document.count({ where: { house: { ownerId: userId } } }),
    isLastAdmin(prisma, userId),
  ])

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Typography component="h1" variant="h4" gutterBottom>
        {t('title')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        {t.rich('intro', {
          privacy: (chunks) => <Link href="/privacy">{chunks}</Link>,
        })}
      </Typography>

      <Stack spacing={3}>
        <Paper component="section" variant="outlined" sx={{ p: 3 }}>
          <Typography component="h2" variant="h6" gutterBottom>
            {t('account.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('account.email')}
          </Typography>
          <Typography sx={{ overflowWrap: 'anywhere' }}>
            {session.user.email}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {t.rich('account.emailHelp', {
              contact: PRIVACY_CONTACT,
              mail: (chunks) => (
                <Link href={`mailto:${PRIVACY_CONTACT}`}>{chunks}</Link>
              ),
            })}
          </Typography>
          <ProfileName name={session.user.name} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {t('account.createdAt', {
              date: format.dateTime(session.user.createdAt, {
                dateStyle: 'long',
              }),
            })}
          </Typography>
        </Paper>

        <Paper component="section" variant="outlined" sx={{ p: 3 }}>
          <Typography component="h2" variant="h6" gutterBottom>
            {t('data.title')}
          </Typography>
          <Typography sx={{ mb: 1 }}>
            {t('data.summary', { houses, documents })}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('data.body')}
          </Typography>
          <Button href="/api/account/export" download variant="outlined">
            {t('data.export')}
          </Button>
        </Paper>

        <Paper component="section" variant="outlined" sx={{ p: 3 }}>
          <Typography component="h2" variant="h6" gutterBottom>
            {t('delete.title')}
          </Typography>
          <DeleteAccount
            email={session.user.email}
            houses={houses}
            documents={documents}
            lastAdmin={lastAdmin}
          />
        </Paper>
      </Stack>
    </Container>
  )
}
