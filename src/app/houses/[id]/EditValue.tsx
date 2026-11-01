'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { keyLabel, labelOf, type AttributeDefinition } from '@/lib/format'
import { trpc } from '@/lib/trpc'
import type { HouseKey } from '@/server/library/houseKeys'

// What a key holds, from the type's attribute schema or the house keys.
export type ValueKind = {
  datatype: string
  unit?: string
  options?: { value: string; label: string }[]
}

const UNITS: Record<string, string> = { m2: 'm²', SEK: 'kr' }

export function useKinds() {
  const t = useTranslations()
  const locale = useLocale()
  return {
    fromAttribute: (def: AttributeDefinition): ValueKind => ({
      datatype: def.datatype,
      unit: def.unit,
      options: def.options
        ? Object.entries(def.options).map(([value, label]) => ({
            value,
            label: labelOf(label, locale) ?? value,
          }))
        : undefined,
    }),
    fromHouseKey: (key: string, def: HouseKey): ValueKind => ({
      datatype: def.datatype,
      unit: def.unit,
      options: def.options?.map((value) => ({
        value,
        label: t.has(`house.value.${key}.${value}`)
          ? t(`house.value.${key}.${value}`)
          : value,
      })),
    }),
  }
}

type Target = { houseId: string; componentId?: string }

// The text a stored value starts from in the form.
const initialText = (value: unknown) =>
  Array.isArray(value)
    ? value.join('\n')
    : value === undefined || value === null
      ? ''
      : String(value)

function parse(kind: ValueKind, text: string): unknown {
  const s = text.trim()
  switch (kind.datatype) {
    case 'number':
      return Number(s.replace(',', '.').replace(/\s/g, ''))
    case 'year':
      return Number.parseInt(s, 10)
    case 'boolean':
      return s === 'true'
    case 'list':
      return s
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean)
    default:
      return s
  }
}

// Sets a value as the user's own: a new observation with source USER,
// approved at once. With keys, the user picks which value to add.
export function EditValueDialog({
  target,
  title,
  fixedKey,
  keys,
  value,
  onClose,
}: {
  target: Target
  title: string
  fixedKey?: { key: string; kind: ValueKind }
  keys?: { key: string; label: string; kind: ValueKind }[]
  value?: unknown
  onClose: () => void
}) {
  const t = useTranslations('edit')
  const utils = trpc.useUtils()
  const [key, setKey] = useState(fixedKey?.key ?? keys?.[0]?.key ?? '')
  const [text, setText] = useState(initialText(value))
  const kind = fixedKey?.kind ??
    keys?.find((k) => k.key === key)?.kind ?? {
      datatype: 'text',
    }
  const save = trpc.house.setValue.useMutation({
    onSuccess: async () => {
      await utils.house.invalidate()
      onClose()
    },
  })
  const submit = () =>
    save.mutate({
      ...target,
      value: {
        key,
        value: parse(kind, text) as string | number | boolean | string[],
      },
    })

  const input =
    kind.options || kind.datatype === 'boolean' ? (
      <TextField
        select
        label={t('value')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        fullWidth
      >
        {(
          kind.options ?? [
            { value: 'true', label: t('yes') },
            { value: 'false', label: t('no') },
          ]
        ).map((o) => (
          <MenuItem key={o.value} value={o.value}>
            {o.label}
          </MenuItem>
        ))}
      </TextField>
    ) : (
      <TextField
        label={t('value')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        type={kind.datatype === 'date' ? 'date' : 'text'}
        multiline={kind.datatype === 'list' || kind.datatype === 'text'}
        helperText={
          kind.datatype === 'list'
            ? t('listHint')
            : kind.unit
              ? t('unit', { unit: UNITS[kind.unit] ?? kind.unit })
              : undefined
        }
        slotProps={{
          htmlInput: {
            inputMode:
              kind.datatype === 'number' || kind.datatype === 'year'
                ? 'decimal'
                : undefined,
          },
          inputLabel: kind.datatype === 'date' ? { shrink: true } : undefined,
        }}
        fullWidth
        autoFocus
      />
    )

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {keys && (
            <TextField
              select
              label={t('key')}
              value={key}
              onChange={(e) => {
                setKey(e.target.value)
                setText('')
              }}
              fullWidth
            >
              {keys.map((k) => (
                <MenuItem key={k.key} value={k.key}>
                  {k.label}
                </MenuItem>
              ))}
            </TextField>
          )}
          {input}
          <Typography variant="caption" color="text.secondary">
            {t('userWins')}
          </Typography>
          {save.isError && (
            <Alert severity="error" sx={{ whiteSpace: 'pre-line' }}>
              {t('failed')} {save.error.message}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={save.isPending || !key || text.trim() === ''}
        >
          {t('save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// Retracts an approved value or dismisses a work item after asking.
export function RetractDialog({
  houseId,
  observationId,
  workItemId,
  title,
  body,
  confirm,
  onClose,
}: {
  houseId: string
  observationId?: string
  workItemId?: string
  title: string
  body: string
  confirm: string
  onClose: () => void
}) {
  const t = useTranslations('edit')
  const utils = trpc.useUtils()
  const retract = trpc.house.retract.useMutation({
    onSuccess: async () => {
      await utils.house.invalidate()
      onClose()
    },
  })
  return (
    <Dialog open onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{body}</DialogContentText>
        {retract.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {t('failed')}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button
          color="error"
          disabled={retract.isPending}
          onClick={() =>
            retract.mutate(
              observationId
                ? { houseId, observationId }
                : { houseId, workItemId: workItemId! }
            )
          }
        >
          {confirm}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export function useKeyLabel() {
  const t = useTranslations()
  const locale = useLocale()
  return (key: string, attribute?: AttributeDefinition) =>
    keyLabel(key, { attribute, locale, t })
}
