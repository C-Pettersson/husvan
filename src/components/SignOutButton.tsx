'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@mui/material'
import { authClient } from '@/lib/authClient'

export default function SignOutButton() {
  const t = useTranslations('nav')
  const router = useRouter()

  return (
    <Button
      color="inherit"
      onClick={async () => {
        await authClient.signOut()
        router.push('/')
        router.refresh()
      }}
    >
      {t('signOut')}
    </Button>
  )
}
