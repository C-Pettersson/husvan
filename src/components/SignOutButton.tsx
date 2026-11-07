'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@mui/material'
import { forgetHouses } from '@/app/houses/storedList'
import { authClient } from '@/lib/authClient'

export function useSignOut() {
  const router = useRouter()

  return async () => {
    await authClient.signOut()
    forgetHouses()
    router.push('/')
    router.refresh()
  }
}

export default function SignOutButton() {
  const t = useTranslations('nav')
  const signOut = useSignOut()

  return (
    <Button color="inherit" onClick={signOut}>
      {t('signOut')}
    </Button>
  )
}
