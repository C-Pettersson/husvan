'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Alert, Button, Stack, TextField } from '@mui/material'
import { authClient } from '@/lib/authClient'

// When the login was started by /oauth2/authorize, the page URL carries the
// signed OAuth query. The auth client sends it along, and the response is a
// redirect onward to consent or back to Claude instead of to the house list.
export default function LoginForm() {
  const t = useTranslations('login')
  const router = useRouter()
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setFailed(false)
    const { data, error } = await authClient.signIn.email({
      email: String(form.get('email')),
      password: String(form.get('password')),
    })
    if (error || !data) {
      setFailed(true)
      setPending(false)
      return
    }
    if (data.redirect && data.url) {
      window.location.href = data.url
      return
    }
    router.push('/houses')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack spacing={2}>
        {failed && <Alert severity="error">{t('failed')}</Alert>}
        <TextField
          name="email"
          type="email"
          label={t('email')}
          autoComplete="username"
          required
          autoFocus
        />
        <TextField
          name="password"
          type="password"
          label={t('password')}
          autoComplete="current-password"
          required
        />
        <Button type="submit" variant="contained" disabled={pending}>
          {t('submit')}
        </Button>
      </Stack>
    </form>
  )
}
