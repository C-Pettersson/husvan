'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { trpc } from '@/lib/trpc'

type WorkItem = {
  id: string
  componentId: string | null
  kind: 'REPLACEMENT' | 'REPAIR' | 'INVESTIGATION'
  severity: Severity | null
  description: string
  yearMin: number | null
  yearMax: number | null
  costLowSek: number | null
  costHighSek: number | null
}

const KINDS = ['REPAIR', 'REPLACEMENT', 'INVESTIGATION'] as const
const SEVERITIES = ['MINOR', 'RISK', 'DEFECT', 'SEVERE'] as const
type Severity = (typeof SEVERITIES)[number]

const num = (s: string) =>
  s.trim() === '' ? undefined : Number(s.replace(',', '.').replace(/\s/g, ''))
const text = (n: number | null | undefined) =>
  n === null || n === undefined ? '' : String(n)

// A new work item, or one restating an existing item with replaces, so a
// priced finding takes the place of the unpriced one instead of adding to
// it (CLAUDE.md, "Precisera en åtgärd").
export function WorkItemDialog({
  houseId,
  item,
  components,
  onClose,
}: {
  houseId: string
  item?: WorkItem
  components: { id: string; label: string }[]
  onClose: () => void
}) {
  const t = useTranslations()
  const utils = trpc.useUtils()
  const [form, setForm] = useState({
    kind: item?.kind ?? 'REPAIR',
    severity: (item?.severity ?? '') as Severity | '',
    description: item?.description ?? '',
    component: item?.componentId ?? '',
    yearMin: text(item?.yearMin),
    yearMax: text(item?.yearMax),
    costLow: text(item?.costLowSek),
    costHigh: text(item?.costHighSek),
  })
  const save = trpc.house.setWorkItem.useMutation({
    onSuccess: async () => {
      await utils.house.invalidate()
      onClose()
    },
  })
  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [key]: e.target.value })
  const submit = () =>
    save.mutate({
      houseId,
      workItem: {
        replaces: item?.id,
        component: form.component || undefined,
        kind: form.kind,
        severity: form.severity || undefined,
        description: form.description.trim(),
        yearMin: num(form.yearMin),
        yearMax: num(form.yearMax),
        costLowSek: num(form.costLow),
        costHighSek: num(form.costHigh),
      },
    })

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {t(item ? 'workItemEdit.editTitle' : 'workItemEdit.addTitle')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            select
            label={t('workItemEdit.kind')}
            value={form.kind}
            onChange={set('kind')}
          >
            {KINDS.map((k) => (
              <MenuItem key={k} value={k}>
                {t(`workItemKind.${k.toLowerCase()}`)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label={t('workItemEdit.severity')}
            value={form.severity}
            onChange={set('severity')}
          >
            <MenuItem value="">{t('workItemEdit.noSeverity')}</MenuItem>
            {SEVERITIES.map((s) => (
              <MenuItem key={s} value={s}>
                {t(`severity.${s}`)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label={t('workItemEdit.description')}
            value={form.description}
            onChange={set('description')}
            multiline
            minRows={2}
            autoFocus
          />
          <TextField
            select
            label={t('workItemEdit.component')}
            value={form.component}
            onChange={set('component')}
          >
            <MenuItem value="">{t('workItemEdit.wholeHouse')}</MenuItem>
            {components.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" spacing={2}>
            <TextField
              label={t('workItemEdit.yearMin')}
              value={form.yearMin}
              onChange={set('yearMin')}
              slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              fullWidth
            />
            <TextField
              label={t('workItemEdit.yearMax')}
              value={form.yearMax}
              onChange={set('yearMax')}
              slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              fullWidth
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              label={t('workItemEdit.costLow')}
              value={form.costLow}
              onChange={set('costLow')}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              fullWidth
            />
            <TextField
              label={t('workItemEdit.costHigh')}
              value={form.costHigh}
              onChange={set('costHigh')}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              fullWidth
            />
          </Stack>
          {item && (
            <Typography variant="caption" color="text.secondary">
              {t('workItemEdit.restateNote')}
            </Typography>
          )}
          {save.isError && (
            <Alert severity="error" sx={{ whiteSpace: 'pre-line' }}>
              {t('edit.failed')} {save.error.message}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('workItemEdit.cancel')}</Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={save.isPending || !form.description.trim()}
        >
          {t('workItemEdit.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

const STATUSES = ['CANDIDATE', 'DECLINED', 'PURCHASED', 'SOLD'] as const

// The house's core: address, property designation, municipality and the
// owner's status. These change in place (CLAUDE.md, "Bara tillägg").
export function CoreDialog({
  house,
  onClose,
}: {
  house: {
    id: string
    address: string
    propertyDesignation: string | null
    municipality: { code: string } | null
    status: (typeof STATUSES)[number]
  }
  onClose: () => void
}) {
  const t = useTranslations()
  const utils = trpc.useUtils()
  const municipalities = trpc.house.municipalities.useQuery()
  const [form, setForm] = useState({
    address: house.address,
    propertyDesignation: house.propertyDesignation ?? '',
    municipalityCode: house.municipality?.code ?? '',
    status: house.status,
  })
  const save = trpc.house.updateCore.useMutation({
    onSuccess: async () => {
      await utils.house.invalidate()
      onClose()
    },
  })
  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [key]: e.target.value })
  const duplicate = save.error?.message.match(/^duplicate: (.*)$/m)?.[1]

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('core.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            select
            label={t('core.status')}
            value={form.status}
            onChange={set('status')}
            helperText={t('core.statusHelp')}
          >
            {STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {t(`house.status.${s.toLowerCase()}`)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label={t('core.address')}
            value={form.address}
            onChange={set('address')}
          />
          <TextField
            label={t('core.propertyDesignation')}
            value={form.propertyDesignation}
            onChange={set('propertyDesignation')}
          />
          <TextField
            select
            label={t('core.municipality')}
            value={form.municipalityCode}
            onChange={set('municipalityCode')}
          >
            <MenuItem value="">{t('core.none')}</MenuItem>
            {(municipalities.data ?? []).map((m) => (
              <MenuItem key={m.code} value={m.code}>
                {m.name}
              </MenuItem>
            ))}
          </TextField>
          {save.isError && (
            <Alert severity="error">
              {duplicate
                ? t('core.duplicate', { address: duplicate })
                : t('core.failed')}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('core.cancel')}</Button>
        <Button
          variant="contained"
          disabled={save.isPending || !form.address.trim()}
          onClick={() =>
            save.mutate({
              houseId: house.id,
              address: form.address.trim(),
              propertyDesignation: form.propertyDesignation.trim() || null,
              municipalityCode: form.municipalityCode || null,
              status: form.status,
            })
          }
        >
          {t('core.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
