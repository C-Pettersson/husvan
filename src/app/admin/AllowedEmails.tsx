'use client'

import { FormEvent, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import {
  Alert,
  Button,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  TextField,
} from '@mui/material'
import BlockIcon from '@mui/icons-material/Block'
import { trpc } from '@/lib/trpc'

// The allowlist: who may request a login link. Blocking an address also ends
// that user's sessions and Claude's tokens; the admin's own address stays.
export default function AllowedEmails({ selfEmail }: { selfEmail: string }) {
  const t = useTranslations('admin')
  const format = useFormatter()
  const utils = trpc.useUtils()
  const list = trpc.admin.allowedEmails.useQuery()
  const [email, setEmail] = useState('')
  const [failed, setFailed] = useState<'add' | 'remove' | null>(null)

  const invalidate = () => utils.admin.allowedEmails.invalidate()
  const add = trpc.admin.allowEmail.useMutation({
    onSuccess: () => {
      setEmail('')
      setFailed(null)
      invalidate()
    },
    onError: () => setFailed('add'),
  })
  const remove = trpc.admin.revokeEmail.useMutation({
    onSuccess: () => {
      setFailed(null)
      invalidate()
    },
    onError: () => setFailed('remove'),
  })

  function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    add.mutate({ email: email.trim().toLowerCase() })
  }

  const date = (value: Date) => format.dateTime(value, { dateStyle: 'medium' })

  return (
    <Stack spacing={3}>
      <Paper component="form" onSubmit={onAdd} sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <TextField
            type="email"
            label={t('email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            size="small"
            required
            fullWidth
          />
          <Button
            type="submit"
            variant="contained"
            disabled={add.isPending}
            sx={{ whiteSpace: 'nowrap' }}
          >
            {t('add')}
          </Button>
        </Stack>
      </Paper>
      {failed === 'add' && <Alert severity="error">{t('addFailed')}</Alert>}
      {failed === 'remove' && (
        <Alert severity="error">{t('removeFailed')}</Alert>
      )}
      {list.isError && <Alert severity="error">{t('loadFailed')}</Alert>}
      <Paper>
        <List disablePadding>
          {list.data?.map((entry) => {
            const isSelf = entry.email === selfEmail
            return (
              <ListItem
                key={entry.email}
                divider
                secondaryAction={
                  isSelf ? null : entry.blockedAt ? (
                    <Button
                      size="small"
                      disabled={add.isPending}
                      onClick={() => add.mutate({ email: entry.email })}
                    >
                      {t('allowAgain')}
                    </Button>
                  ) : (
                    <IconButton
                      edge="end"
                      aria-label={t('remove')}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate({ email: entry.email })}
                    >
                      <BlockIcon />
                    </IconButton>
                  )
                }
              >
                <ListItemText
                  primary={
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      flexWrap="wrap"
                    >
                      <span>{entry.email}</span>
                      {isSelf && <Chip size="small" label={t('you')} />}
                      {entry.user?.role === 'ADMIN' && (
                        <Chip size="small" label={t('admin')} />
                      )}
                      {entry.blockedAt && (
                        <Chip
                          size="small"
                          color="warning"
                          label={t('blockedChip')}
                        />
                      )}
                    </Stack>
                  }
                  secondary={
                    entry.blockedAt
                      ? t('blocked', { date: date(entry.blockedAt) })
                      : entry.user
                        ? entry.user.lastSeenAt
                          ? t('lastSeen', { date: date(entry.user.lastSeenAt) })
                          : t('signedUp')
                        : t('neverSignedIn', { date: date(entry.createdAt) })
                  }
                />
              </ListItem>
            )
          })}
        </List>
      </Paper>
    </Stack>
  )
}
