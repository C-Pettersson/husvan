'use client'

import { FormEvent, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Alert,
  Button,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { trpc } from '@/lib/trpc'

// Opens and closes signup, and shows where the day's limit stands. Stored in
// the database, not the Secret, so that it takes effect without a restart.
export default function SignupSettings() {
  const t = useTranslations('admin.signup')
  const utils = trpc.useUtils()
  const state = trpc.admin.signup.useQuery()
  // What the admin is typing; the stored value until then.
  const [draft, setDraft] = useState<string | null>(null)
  const save = trpc.admin.setSignup.useMutation({
    onSuccess: () => {
      setDraft(null)
      utils.admin.signup.invalidate()
    },
  })

  if (!state.data) return null
  const { open, status, accountsToday, newAddressMailsToday } = state.data
  const accountsPerDay = draft ?? String(state.data.accountsPerDay)

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    save.mutate({ open, accountsPerDay: Number(accountsPerDay) })
  }

  return (
    <Paper component="form" onSubmit={onSave} sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography component="h2" variant="h6">
          {t('title')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('hint')}
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={open}
              disabled={save.isPending}
              onChange={(e) =>
                save.mutate({
                  open: e.target.checked,
                  accountsPerDay: state.data.accountsPerDay,
                })
              }
            />
          }
          label={t('toggle')}
        />
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <TextField
            type="number"
            label={t('accountsPerDay')}
            value={accountsPerDay}
            onChange={(e) => setDraft(e.target.value)}
            size="small"
            required
            sx={{ width: 220 }}
            slotProps={{ htmlInput: { min: 0, max: 1000, step: 1 } }}
          />
          <Button type="submit" variant="outlined" disabled={save.isPending}>
            {t('save')}
          </Button>
        </Stack>
        <Alert severity={status === 'paused' ? 'warning' : 'info'}>
          {t(`status.${status}`, {
            accounts: accountsToday,
            cap: state.data.accountsPerDay,
            mails: newAddressMailsToday,
          })}
        </Alert>
        {save.isError && <Alert severity="error">{t('saveFailed')}</Alert>}
      </Stack>
    </Paper>
  )
}
