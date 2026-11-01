import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { Alert, Container, Paper, Typography } from '@mui/material'
import { verifyOAuthQueryParams } from '@better-auth/oauth-provider'
import { auth } from '@/lib/auth'
import ConsentForm from './ConsentForm'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('consent')
  return { title: t('title'), robots: { index: false } }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const t = await getTranslations('consent')
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of [value ?? []].flat()) query.append(key, v)
  }

  // The authorize endpoint signs the query it redirects here with. Anything
  // else is not a consent request from this server.
  const { secret } = await auth.$context
  const valid = await verifyOAuthQueryParams(query.toString(), secret)
  const clientId = query.get('client_id')
  const client =
    valid && clientId
      ? await auth.api
          .getOAuthClientPublic({
            query: { client_id: clientId },
            headers: await headers(),
          })
          .catch(() => null)
      : null

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Paper sx={{ p: 4 }}>
        <Typography component="h1" variant="h5" gutterBottom>
          {t('title')}
        </Typography>
        {client ? (
          <ConsentForm
            clientName={client.client_name ?? t('unknownClient')}
            clientUri={client.client_uri ?? null}
            scopes={(query.get('scope') ?? '').split(' ').filter(Boolean)}
          />
        ) : (
          <Alert severity="error">{t('invalid')}</Alert>
        )}
      </Paper>
    </Container>
  )
}
