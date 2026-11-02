'use client'

import { FormEvent, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Alert, Button, Stack, TextField } from '@mui/material'
import { authClient } from '@/lib/authClient'
import { authorizationCallbackURL } from '@/lib/oauthContinue'
import Turnstile from '@/components/Turnstile'
import { TURNSTILE_ACTION } from '@/lib/turnstile'

// The usual way in is a login link. The link's callback is the house list, or,
// when the login was started by /oauth2/authorize, that endpoint again with
// the original parameters so the authorization continues (oauthContinue.ts).
//
// A password login is kept for the seeded owner. There the auth client sends
// the signed OAuth query along and the server continues in the same request.
export default function LoginForm({
  turnstileSiteKey,
}: {
  turnstileSiteKey: string | null
}) {
  const t = useTranslations('login')
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<'link' | 'password'>('link')
  const [sent, setSent] = useState(false)
  const [failed, setFailed] = useState<'link' | 'password' | null>(null)
  const [pending, setPending] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaReset, setCaptchaReset] = useState(0)

  // A link that did not verify comes back here with ?error=...
  const linkInvalid = searchParams.has('error') && !sent && !failed

  const captchaBlocks = turnstileSiteKey !== null && captchaToken === null
  const fetchOptions = captchaToken
    ? { headers: { 'x-captcha-response': captchaToken } }
    : undefined

  function finish() {
    setPending(false)
    setCaptchaReset((n) => n + 1)
  }

  async function sendLink(email: string) {
    const search = window.location.search
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: authorizationCallbackURL(search, '/houses'),
      errorCallbackURL: `/login${search}`,
      fetchOptions,
    })
    finish()
    if (error) {
      setFailed('link')
      return
    }
    setSent(true)
  }

  async function signInWithPassword(email: string, password: string) {
    const { data, error } = await authClient.signIn.email({
      email,
      password,
      fetchOptions,
    })
    finish()
    if (error || !data) {
      setFailed('password')
      return
    }
    if (data.redirect && data.url) {
      window.location.href = data.url
      return
    }
    router.push('/houses')
    router.refresh()
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email'))
    setPending(true)
    setFailed(null)
    if (mode === 'password') {
      await signInWithPassword(email, String(form.get('password')))
    } else {
      await sendLink(email)
    }
  }

  if (sent) {
    return <Alert severity="success">{t('linkSent')}</Alert>
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack spacing={2}>
        {linkInvalid && <Alert severity="warning">{t('linkInvalid')}</Alert>}
        {failed === 'link' && <Alert severity="error">{t('linkFailed')}</Alert>}
        {failed === 'password' && <Alert severity="error">{t('failed')}</Alert>}
        <TextField
          name="email"
          type="email"
          label={t('email')}
          autoComplete="username"
          required
          autoFocus
        />
        {mode === 'password' && (
          <TextField
            name="password"
            type="password"
            label={t('password')}
            autoComplete="current-password"
            required
          />
        )}
        {turnstileSiteKey && (
          <Turnstile
            siteKey={turnstileSiteKey}
            action={TURNSTILE_ACTION}
            onToken={setCaptchaToken}
            resetSignal={captchaReset}
          />
        )}
        <Button
          type="submit"
          variant="contained"
          disabled={pending || captchaBlocks}
        >
          {mode === 'password' ? t('submit') : t('sendLink')}
        </Button>
        <Button
          type="button"
          size="small"
          onClick={() => {
            setFailed(null)
            setMode(mode === 'password' ? 'link' : 'password')
          }}
        >
          {mode === 'password' ? t('useLink') : t('usePassword')}
        </Button>
      </Stack>
    </form>
  )
}
