'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material'
import { forgetHouses } from '@/app/houses/storedList'
import { authClient } from '@/lib/authClient'
import { trpc } from '@/lib/trpc'

export default function DeleteAccount({
  email,
  houses,
  documents,
  lastAdmin,
}: {
  email: string
  houses: number
  documents: number
  lastAdmin: boolean
}) {
  const t = useTranslations('profile.delete')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const remove = trpc.account.delete.useMutation({
    onSuccess: async () => {
      forgetHouses()
      // The session is gone with the account; this clears the browser's cookie.
      await authClient.signOut().catch(() => {})
    },
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    remove.mutate({ confirmEmail: typed })
  }

  if (lastAdmin) return <Alert severity="info">{t('lastAdmin')}</Alert>

  const matches = typed.trim().toLowerCase() === email.toLowerCase()
  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('body')}
      </Typography>
      <Button variant="outlined" color="error" onClick={() => setOpen(true)}>
        {t('button')}
      </Button>

      <Dialog
        open={open}
        onClose={() => {
          if (!remove.isPending && !remove.isSuccess) setOpen(false)
        }}
        fullWidth
        maxWidth="xs"
      >
        {remove.isSuccess ? (
          <>
            <DialogTitle>{t('deletedTitle')}</DialogTitle>
            <DialogContent>
              <DialogContentText>{t('deletedBody')}</DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => {
                  router.push('/')
                  router.refresh()
                }}
              >
                {t('toHome')}
              </Button>
            </DialogActions>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <DialogTitle>{t('dialogTitle')}</DialogTitle>
            <DialogContent>
              <DialogContentText sx={{ mb: 2 }}>
                {t('dialogBody', { houses, documents, email })}
              </DialogContentText>
              <TextField
                autoFocus
                type="email"
                label={t('confirmLabel')}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                size="small"
                fullWidth
              />
              {remove.isError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {t('failed')}
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => setOpen(false)}
                disabled={remove.isPending}
              >
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                color="error"
                variant="contained"
                disabled={!matches || remove.isPending}
              >
                {t('confirm')}
              </Button>
            </DialogActions>
          </form>
        )}
      </Dialog>
    </>
  )
}
