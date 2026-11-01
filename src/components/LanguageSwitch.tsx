'use client'

import { useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ToggleButton, ToggleButtonGroup } from '@mui/material'
import { setLocale } from '@/app/actions/locale'
import { isLocale, locales } from '@/i18n/locales'

export default function LanguageSwitch() {
  const t = useTranslations('nav')
  const locale = useLocale()
  const [pending, startTransition] = useTransition()

  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={locale}
      disabled={pending}
      aria-label={t('language')}
      onChange={(_, value: string | null) => {
        if (value && isLocale(value)) {
          startTransition(() => setLocale(value))
        }
      }}
    >
      {locales.map((l) => (
        <ToggleButton key={l} value={l}>
          {l.toUpperCase()}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}
