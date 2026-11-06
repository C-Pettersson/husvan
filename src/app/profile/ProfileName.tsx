'use client'

import { FormEvent, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Alert, Button, Stack, TextField } from '@mui/material'
import { trpc } from '@/lib/trpc'

export default function ProfileName({ name }: { name: string }) {
  const t = useTranslations('profile.account')
  const [value, setValue] = useState(name)
  const [stored, setStored] = useState(name)
  const save = trpc.account.updateName.useMutation({
    onSuccess: (_, input) => setStored(input.name.trim()),
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    save.mutate({ name: value })
  }

  const unchanged = value.trim() === stored
  return (
    <Stack component="form" onSubmit={onSubmit} spacing={1.5}>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <TextField
          label={t('name')}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            save.reset()
          }}
          size="small"
          required
          fullWidth
          slotProps={{ htmlInput: { maxLength: 100 } }}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={save.isPending || unchanged || !value.trim()}
        >
          {t('save')}
        </Button>
      </Stack>
      {save.isSuccess && <Alert severity="success">{t('saved')}</Alert>}
      {save.isError && <Alert severity="error">{t('saveFailed')}</Alert>}
    </Stack>
  )
}
