'use client'

import { useEffect, useRef } from 'react'
import Script from 'next/script'
import { Box } from '@mui/material'

// Cloudflare Turnstile, rendered explicitly so the token reaches React state.
// A token is single-use: bump resetSignal after each submit to get a new one.
type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      action?: string
      callback: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
      theme?: 'auto' | 'light' | 'dark'
      size?: 'normal' | 'flexible' | 'compact'
    }
  ) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export default function Turnstile({
  siteKey,
  action,
  onToken,
  resetSignal = 0,
}: {
  siteKey: string
  // Echoed back by siteverify, so the server can tell a login token from one
  // minted on another form with the same site key.
  action: string
  onToken: (token: string | null) => void
  resetSignal?: number
}) {
  const container = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)
  useEffect(() => {
    onTokenRef.current = onToken
  }, [onToken])

  // One widget per mount. The script may still be loading on the first run,
  // so the effect polls for the API, and the cleanup removes the widget it
  // created so a remount (React strict mode, navigation) starts clean.
  useEffect(() => {
    const element = container.current
    if (!element) return
    let id: string | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    const mount = () => {
      const api = window.turnstile
      if (!api || id) return
      if (timer) clearInterval(timer)
      timer = null
      id = api.render(element, {
        sitekey: siteKey,
        action,
        theme: 'auto',
        size: 'flexible',
        callback: (token) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(null),
        'error-callback': () => onTokenRef.current(null),
      })
      widgetId.current = id
    }
    mount()
    if (!id) timer = setInterval(mount, 200)
    return () => {
      if (timer) clearInterval(timer)
      if (id) {
        try {
          window.turnstile?.remove(id)
        } catch {
          // The widget is already gone; nothing to clean up.
        }
      }
      widgetId.current = null
    }
  }, [siteKey, action])

  useEffect(() => {
    if (!resetSignal || !widgetId.current) return
    try {
      window.turnstile?.reset(widgetId.current)
    } catch {
      // Same as above.
    }
    onTokenRef.current(null)
  }, [resetSignal])

  return (
    <>
      <Script src={SCRIPT_URL} strategy="afterInteractive" />
      <Box ref={container} sx={{ minHeight: 65 }} />
    </>
  )
}
