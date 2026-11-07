'use client'

import { use, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Link,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import {
  formatSek,
  formatSekRange,
  formatSekShort,
  formatValue,
  keyLabel,
  type Range,
} from '@/lib/format'
import { saveHouses, useStoredHouses, type House } from './storedList'

const FEATURES = [
  'pool',
  'sauna',
  'deck',
  'balcony',
  'sunroom',
  'garage',
  'wood_stove',
  'heat_pump_air_air',
  'basement',
] as const

const FIGURES = ['living_area', 'construction_year', 'room_count']

// The list the server sends with the page. It replaces the stored copy on
// screen and becomes the copy for the next visit.
export function FreshHouseList({
  houses,
}: {
  houses: Promise<House[] | null>
}) {
  const t = useTranslations()
  const list = use(houses)
  useEffect(() => {
    if (list) saveHouses(list)
  }, [list])

  if (!list) return <Alert severity="error">{t('error.generic')}</Alert>
  return <HouseList houses={list} />
}

// The list from the last visit in this browser, until the fresh one
// arrives. A spinner the first time.
export function StoredHouseList() {
  const stored = useStoredHouses()
  return stored ? <HouseList houses={stored} /> : <CircularProgress />
}

function HouseList({ houses }: { houses: House[] }) {
  const t = useTranslations()
  const [wanted, setWanted] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])

  if (houses.length === 0) {
    return (
      <Stack spacing={2} alignItems="flex-start">
        <Typography color="text.secondary">{t('houses.empty')}</Typography>
        <Button href="/getting-started" variant="outlined">
          {t('houses.connect')}
        </Button>
      </Stack>
    )
  }

  // A filter hides only houses known to lack a feature; unknown is shown
  // apart (CLAUDE.md, "Okänt är inte nej").
  const answer = (h: House, f: string) =>
    (h.features as Record<string, string>)[f]
  const hidden = houses.filter((h) => wanted.some((f) => answer(h, f) === 'no'))
  const shown = houses.filter((h) => !hidden.includes(h))
  const unknownOf = (h: House) =>
    wanted.filter((f) => answer(h, f) === 'unknown')
  const matching = shown.filter((h) => unknownOf(h).length === 0)
  const unknown = shown.filter((h) => unknownOf(h).length > 0)

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  const canCompare = selected.length >= 2 && selected.length <= 6

  return (
    <>
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        useFlexGap
        sx={{ mb: 2 }}
      >
        <Typography color="text.secondary">
          {t('houses.count', { count: houses.length })}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" color="text.secondary">
            {t('houses.compareHint')}
          </Typography>
          <Button
            variant="contained"
            disabled={!canCompare}
            href={`/compare?ids=${selected.join(',')}`}
          >
            {t('houses.compare', { count: selected.length })}
          </Button>
        </Stack>
      </Stack>

      <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, mb: 3 }}>
        <Typography
          component="legend"
          variant="overline"
          color="text.secondary"
        >
          {t('houses.filter')}
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {FEATURES.map((f) => (
            <Chip
              key={f}
              label={t(`feature.${f}`)}
              color={wanted.includes(f) ? 'primary' : 'default'}
              variant={wanted.includes(f) ? 'filled' : 'outlined'}
              onClick={() => setWanted(toggle(wanted, f))}
              aria-pressed={wanted.includes(f)}
            />
          ))}
        </Stack>
        {wanted.length > 0 && (
          <Typography
            variant="caption"
            color="text.secondary"
            component="p"
            sx={{ mt: 1 }}
          >
            {t('houses.filterHint')}
          </Typography>
        )}
      </Box>

      <Stack spacing={2}>
        {matching.map((h) => (
          <HouseCard
            key={h.id}
            house={h}
            selected={selected.includes(h.id)}
            onSelect={() => setSelected(toggle(selected, h.id))}
          />
        ))}
      </Stack>

      {unknown.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography component="h2" variant="h6" sx={{ mb: 1.5 }}>
            {t('houses.unknownGroup')}
          </Typography>
          <Stack spacing={2}>
            {unknown.map((h) => (
              <HouseCard
                key={h.id}
                house={h}
                selected={selected.includes(h.id)}
                onSelect={() => setSelected(toggle(selected, h.id))}
                note={t('houses.unknownFeatures', {
                  features: unknownOf(h)
                    .map((f) => t(`feature.${f}`))
                    .join(', '),
                })}
              />
            ))}
          </Stack>
        </Box>
      )}

      {hidden.length > 0 && (
        <Typography color="text.secondary" sx={{ mt: 3 }}>
          {t('houses.hiddenCount', { count: hidden.length })}
        </Typography>
      )}
    </>
  )
}

function HouseCard({
  house: h,
  selected,
  onSelect,
  note,
}: {
  house: House
  selected: boolean
  onSelect: () => void
  note?: string
}) {
  const t = useTranslations()
  const locale = useLocale()
  const figures = FIGURES.flatMap((k) => {
    const v = (h.keyFigures as Record<string, unknown>)[k]
    return v === null || v === undefined
      ? []
      : [
          `${keyLabel(k, { locale, t })} ${formatValue(v, {
            key: k,
            unit: k === 'living_area' ? 'm2' : null,
            locale,
            t,
          })}`,
        ]
  })

  return (
    <Paper variant="outlined" sx={{ p: 2, display: 'flex', gap: 1 }}>
      <Checkbox
        checked={selected}
        onChange={onSelect}
        slotProps={{
          input: {
            'aria-label': t('houses.select', { address: h.address }),
          },
        }}
        sx={{ alignSelf: 'flex-start', mt: -0.5, ml: -1 }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack
          direction="row"
          spacing={1}
          rowGap={0.75}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
        >
          <Link
            href={`/houses/${h.id}`}
            variant="subtitle1"
            fontWeight={600}
            underline="hover"
          >
            {h.address}
          </Link>
          <Chip
            size="small"
            label={t(`house.status.${h.status.toLowerCase()}`)}
          />
          {typeof h.saleStatus === 'string' && (
            <Chip
              size="small"
              variant="outlined"
              label={formatValue(h.saleStatus, {
                key: 'sale_status',
                unit: null,
                locale,
                t,
              })}
            />
          )}
          {h.openDrafts > 0 && (
            <Chip
              size="small"
              color="warning"
              label={t('houses.drafts', { count: h.openDrafts })}
            />
          )}
          {h.flaggedRisks > 0 && (
            <Chip
              size="small"
              variant="outlined"
              color="error"
              label={t('houses.risks', { count: h.flaggedRisks })}
            />
          )}
          {!h.inspected && (
            <Chip
              size="small"
              variant="outlined"
              label={t('houses.notInspected')}
            />
          )}
        </Stack>
        {(h.municipality || figures.length > 0) && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            {[h.municipality, ...figures].filter(Boolean).join(' · ')}
          </Typography>
        )}
        <Stack
          direction="row"
          spacing={4}
          rowGap={1.5}
          flexWrap="wrap"
          useFlexGap
          sx={{ mt: 1.5 }}
        >
          <Figure
            label={
              h.price ? keyLabel(h.price.kind, { locale, t }) : t('cost.price')
            }
            value={
              h.price ? formatSek(h.price.sek, locale) : t('houses.noPrice')
            }
          />
          <Figure label={t('cost.debt')} range={h.maintenanceDebt} />
          {h.maintenanceAdjustedPrice && (
            <Figure
              label={t('cost.adjusted')}
              range={h.maintenanceAdjustedPrice}
              strong
            />
          )}
        </Stack>
        {note && (
          <Typography
            variant="caption"
            color="text.secondary"
            component="p"
            sx={{ mt: 1 }}
          >
            {note}
          </Typography>
        )}
      </Box>
    </Paper>
  )
}

function Figure({
  label,
  value,
  range,
  strong,
}: {
  label: string
  value?: string
  range?: Range
  strong?: boolean
}) {
  const locale = useLocale()
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography
        variant={strong ? 'h6' : 'body1'}
        fontWeight={strong ? 700 : 500}
        component="div"
        sx={{ lineHeight: 1.3 }}
      >
        {range ? formatSekShort(range.typical, locale) : value}
      </Typography>
      {range && (
        <Typography variant="caption" color="text.secondary" component="div">
          {formatSekRange(range, locale)}
        </Typography>
      )}
    </Box>
  )
}
