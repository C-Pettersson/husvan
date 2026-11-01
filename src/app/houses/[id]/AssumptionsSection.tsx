'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { formatSek, formatShare, numberFormat } from '@/lib/format'
import { trpc } from '@/lib/trpc'

const KEYS = [
  'horizon_years',
  'start_year',
  'interest_rate',
  'loan_sek',
  'electricity_price_sek_kwh',
  'district_heating_price_sek_kwh',
  'operating_cost_trend',
] as const

type Key = (typeof KEYS)[number]

// The forecast's assumptions and where each comes from; the user changes
// them for this house or for all houses (set_assumption on the web).
export default function AssumptionsSection({ houseId }: { houseId: string }) {
  const t = useTranslations('assumptions')
  const locale = useLocale()
  const analysis = trpc.house.analysis.useQuery({ id: houseId })
  const [open, setOpen] = useState(false)
  if (!analysis.data) return null
  const { values, source, energyPrices } = analysis.data.assumptions
  const v = values as Partial<Record<Key, number | string>>
  const n = (x: number) => numberFormat(locale).format(x)

  const shown = (key: Key) => {
    const value = v[key]
    if (key === 'electricity_price_sek_kwh' && value === undefined)
      return energyPrices.electricitySekPerKwh === null
        ? t('notSet')
        : `${t('perKwh', { price: n(energyPrices.electricitySekPerKwh) })} (${t('fromMunicipality')})`
    if (key === 'district_heating_price_sek_kwh' && value === undefined)
      return energyPrices.districtHeatingSekPerKwh === null
        ? t('notSet')
        : `${t('perKwh', { price: n(energyPrices.districtHeatingSekPerKwh) })} (${t('fromMunicipality')})`
    if (value === undefined) return t('notSet')
    switch (key) {
      case 'horizon_years':
        return t('years', { count: value as number })
      case 'start_year':
        return String(value)
      case 'interest_rate':
        return formatShare(value as number, locale)
      case 'loan_sek':
        return formatSek(value as number, locale)
      case 'operating_cost_trend':
        return t(`trend.${value}`)
      default:
        return t('perKwh', { price: n(value as number) })
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Table size="small">
        <TableBody>
          {KEYS.map((key) => (
            <TableRow key={key}>
              <TableCell
                component="th"
                scope="row"
                sx={{ color: 'text.secondary', width: '38%' }}
              >
                {t(`key.${key}`)}
              </TableCell>
              <TableCell>
                {shown(key)}
                {source[key] && v[key] !== undefined && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    component="span"
                  >
                    {' '}
                    · {t(`source.${source[key]}`)}
                  </Typography>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button size="small" sx={{ mt: 1 }} onClick={() => setOpen(true)}>
        {t('edit')}
      </Button>
      {open && (
        <AssumptionsDialog
          houseId={houseId}
          current={v}
          onClose={() => setOpen(false)}
        />
      )}
    </Paper>
  )
}

function AssumptionsDialog({
  houseId,
  current,
  onClose,
}: {
  houseId: string
  current: Partial<Record<Key, number | string>>
  onClose: () => void
}) {
  const t = useTranslations('assumptions')
  const utils = trpc.useUtils()
  const [scope, setScope] = useState<'house' | 'all'>('house')
  // Text as typed; empty means unchanged.
  const [form, setForm] = useState<Record<Key, string>>({
    horizon_years: '',
    start_year: '',
    interest_rate: '',
    loan_sek: '',
    electricity_price_sek_kwh: '',
    district_heating_price_sek_kwh: '',
    operating_cost_trend: String(current.operating_cost_trend ?? 'none'),
  })
  const save = trpc.house.setAssumptions.useMutation({
    onSuccess: async () => {
      await utils.house.invalidate()
      onClose()
    },
  })
  const num = (s: string) => Number(s.replace(',', '.').replace(/\s/g, ''))

  const submit = () => {
    const values: Record<string, number | string> = {}
    for (const key of KEYS) {
      const s = form[key].trim()
      if (!s) continue
      if (key === 'operating_cost_trend') {
        if (s !== (current.operating_cost_trend ?? 'none')) values[key] = s
      } else if (key === 'interest_rate') values[key] = num(s) / 100
      else values[key] = num(s)
    }
    save.mutate({
      houseId: scope === 'house' ? houseId : undefined,
      values,
    })
  }

  const field = (key: Key, label: string, placeholder?: unknown) => (
    <TextField
      key={key}
      label={label}
      value={form[key]}
      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      placeholder={placeholder === undefined ? undefined : String(placeholder)}
      slotProps={{ htmlInput: { inputMode: 'decimal' } }}
      size="small"
      fullWidth
    />
  )

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('edit')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <RadioGroup
            row
            value={scope}
            onChange={(e) => setScope(e.target.value as 'house' | 'all')}
            aria-label={t('scope')}
          >
            <FormControlLabel
              value="house"
              control={<Radio />}
              label={t('scopeHouse')}
            />
            <FormControlLabel
              value="all"
              control={<Radio />}
              label={t('scopeAll')}
            />
          </RadioGroup>
          {field(
            'horizon_years',
            t('key.horizon_years'),
            current.horizon_years
          )}
          {field('start_year', t('key.start_year'), current.start_year)}
          {field(
            'interest_rate',
            t('interestPercent'),
            typeof current.interest_rate === 'number'
              ? current.interest_rate * 100
              : undefined
          )}
          {field('loan_sek', t('loanSek'), current.loan_sek)}
          {field(
            'electricity_price_sek_kwh',
            t('pricePerKwh', { name: t('key.electricity_price_sek_kwh') }),
            current.electricity_price_sek_kwh
          )}
          {field(
            'district_heating_price_sek_kwh',
            t('pricePerKwh', { name: t('key.district_heating_price_sek_kwh') }),
            current.district_heating_price_sek_kwh
          )}
          <TextField
            select
            size="small"
            label={t('key.operating_cost_trend')}
            value={form.operating_cost_trend}
            onChange={(e) =>
              setForm({ ...form, operating_cost_trend: e.target.value })
            }
          >
            <MenuItem value="none">{t('trend.none')}</MenuItem>
            <MenuItem value="municipality">{t('trend.municipality')}</MenuItem>
          </TextField>
          <Typography variant="caption" color="text.secondary">
            {t('unchangedNote')}
          </Typography>
          {save.isError && (
            <Alert severity="error">
              {t('failed', { error: save.error.message })}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button variant="contained" onClick={submit} disabled={save.isPending}>
          {t('save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
