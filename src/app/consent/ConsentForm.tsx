'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Alert, Button, List, ListItem, Stack, Typography } from '@mui/material'
import { authClient } from '@/lib/authClient'

const KNOWN_SCOPES = ['openid', 'profile', 'email', 'offline_access']

export default function ConsentForm({
  clientName,
  clientUri,
  scopes,
}: {
  clientName: string
  clientUri: string | null
  scopes: string[]
}) {
  const t = useTranslations('consent')
  const ts = useTranslations('scope')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function answer(accept: boolean) {
    setPending(true)
    setFailed(false)
    const { data } = await authClient.oauth2.consent({ accept })
    if (data?.url) {
      window.location.href = data.url
      return
    }
    setFailed(true)
    setPending(false)
  }

  return (
    <Stack spacing={2}>
      <Typography>{t('intro', { client: clientName })}</Typography>
      {clientUri && (
        <Typography variant="body2" color="text.secondary">
          {clientUri}
        </Typography>
      )}
      {scopes.length > 0 && (
        <>
          <Typography variant="subtitle2">{t('scopes')}</Typography>
          <List dense disablePadding>
            {scopes.map((scope) => (
              <ListItem key={scope} disableGutters>
                {KNOWN_SCOPES.includes(scope) ? ts(scope) : scope}
              </ListItem>
            ))}
          </List>
        </>
      )}
      {failed && <Alert severity="error">{t('failed')}</Alert>}
      <Stack direction="row" spacing={2} justifyContent="flex-end">
        <Button disabled={pending} onClick={() => answer(false)}>
          {t('deny')}
        </Button>
        <Button
          variant="contained"
          disabled={pending}
          onClick={() => answer(true)}
        >
          {t('allow')}
        </Button>
      </Stack>
    </Stack>
  )
}
