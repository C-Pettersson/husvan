'use client'

import { FormEvent, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Alert, Button, Stack, TextField } from '@mui/material'
import { authClient } from '@/lib/authClient'
import { authorizationCallbackURL } from '@/lib/oauthContinue'
import Turnstile from '@/components/Turnstile'
import { TURNSTILE_ACTION } from '@/lib/turnstile'

// The usual way in is the login mail, which holds a link and a six-digit code.
// The link's callback is the house list, or, when the login was started by
// /oauth2/authorize, that endpoint again with the original parameters so the
// authorization continues (oauthContinue.ts). The code is for reading the mail
// on another device: typed in here, it signs in this browser.
//
// A password login is kept for the seeded owner. For it and for the code, the
// auth client sends the signed OAuth query along and the server continues the
// authorization in the same request.
export default function LoginForm({
  turnstileSiteKey,
}: {
  turnstileSiteKey: string | null
}) {
  const t = useTranslations('login')
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<'link' | 'password'>('link')
  // The address the login mail went to; set once it is sent.
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [failed, setFailed] = useState<'link' | 'password' | 'code' | null>(
    null
  )
  const [pending, setPending] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaReset, setCaptchaReset] = useState(0)

  // A link that did not verify comes back here with ?error=...
  const linkInvalid = searchParams.has('error') && !sentTo && !failed

  const captchaBlocks = turnstileSiteKey !== null && captchaToken === null
  const fetchOptions = captchaToken
    ? { headers: { 'x-captcha-response': captchaToken } }
    : undefined

  function finish() {
    setPending(false)
    setCaptchaReset((n) => n + 1)
  }

  // After a sign-in that started at /oauth2/authorize the server answers with
  // where to go next; otherwise the house list.
  function continueAfterSignIn(data: unknown) {
    const next = data as { redirect?: unknown; url?: unknown }
    if (next.redirect === true && typeof next.url === 'string') {
      window.location.href = next.url
      return
    }
    router.push('/houses')
    router.refresh()
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
    setSentTo(email)
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
    continueAfterSignIn(data)
  }

  async function signInWithCode(email: string, otp: string) {
    const { data, error } = await authClient.signIn.emailOtp({ email, otp })
    setPending(false)
    if (error || !data) {
      setFailed('code')
      return
    }
    continueAfterSignIn(data)
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

  async function onSubmitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!sentTo) return
    const form = new FormData(event.currentTarget)
    // Accept "123 456" or a pasted line with stray spaces.
    const otp = String(form.get('code')).replace(/\D/g, '')
    setPending(true)
    setFailed(null)
    await signInWithCode(sentTo, otp)
  }

  if (sentTo) {
    return (
      <form onSubmit={onSubmitCode}>
        <Stack spacing={2}>
          <Alert severity="success">{t('linkSent')}</Alert>
          {failed === 'code' && (
            <Alert severity="error">{t('codeFailed')}</Alert>
          )}
          <TextField
            name="code"
            label={t('code')}
            autoComplete="one-time-code"
            required
            autoFocus
            slotProps={{
              htmlInput: { inputMode: 'numeric', maxLength: 7 },
            }}
          />
          <Button type="submit" variant="contained" disabled={pending}>
            {t('submitCode')}
          </Button>
          <Button
            type="button"
            size="small"
            onClick={() => {
              setFailed(null)
              setSentTo(null)
            }}
          >
            {t('sendAgain')}
          </Button>
        </Stack>
      </form>
    )
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
