'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  Alert,
  AlertTitle,
  Box,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  formatSek,
  formatSekRange,
  formatSekShort,
  keyLabel,
  numberFormat,
  type Range,
} from '@/lib/format'
import { trpc } from '@/lib/trpc'
import { useLabels } from '@/lib/labels'
import AnnualView from './AnnualView'
import YearChart from './YearChart'

// What the house costs (CLAUDE.md, "Kostnadsprognos" and
// "Underhållsskuld och underhållsjusterat pris"): the headline figures with
// their ranges, what the total leaves out, the forecast per year and per
// item, and the debt per part.
export default function CostSection({ houseId }: { houseId: string }) {
  const t = useTranslations()
  const locale = useLocale()
  const analysis = trpc.house.analysis.useQuery({ id: houseId })
  const [view, setView] = useState<'paid' | 'spread'>('paid')
  const labels = useLabels(analysis.data?.types ?? {})

  if (analysis.isPending) return <CircularProgress size={24} />
  if (analysis.isError)
    return <Alert severity="error">{t('cost.loadFailed')}</Alert>

  const a = analysis.data
  const { forecast, gaps } = a
  const endYear = forecast.startYear + forecast.horizonYears - 1
  const gapLines = [
    !gaps.inspected && t('cost.gap.notInspected'),
    gaps.workItemsWithoutCost > 0 &&
      t('cost.gap.workItemsWithoutCost', {
        count: gaps.workItemsWithoutCost,
      }),
    gaps.assumedParts.length > 0 &&
      t('cost.gap.assumedParts', {
        parts: gaps.assumedParts
          .map(
            (p) =>
              `${labels.typeLabel(p.type)} (${formatSekShort(p.maintenanceDebtTypical, locale)})`
          )
          .join(', '),
      }),
    gaps.partsWithoutInstallationYear > 0 &&
      t('cost.gap.partsWithoutInstallationYear', {
        count: gaps.partsWithoutInstallationYear,
      }),
    gaps.partsWithoutCost > 0 &&
      t('cost.gap.partsWithoutCost', { count: gaps.partsWithoutCost }),
    !a.runningCostsKnown && t('cost.gap.runningUnknown'),
  ].filter((x): x is string => Boolean(x))

  const items = [...forecast.items].sort(
    (x, y) => y.total.typical - x.total.typical
  )

  return (
    <Stack spacing={3}>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: '1fr 1fr',
            md: 'repeat(4, 1fr)',
          },
        }}
      >
        <Tile
          label={
            a.price ? keyLabel(a.price.kind, { locale, t }) : t('cost.price')
          }
          value={a.price ? formatSek(a.price.sek, locale) : t('cost.noPrice')}
          help={
            a.priceToAssessedValue
              ? `${t('cost.ratio')} ${numberFormat(locale).format(
                  Math.round(a.priceToAssessedValue.ratio * 100) / 100
                )}. ${t('cost.ratioHelp', {
                  year: String(a.priceToAssessedValue.assessmentYear ?? '–'),
                })}`
              : undefined
          }
        />
        <Tile
          label={t('cost.debt')}
          range={a.maintenanceDebt}
          help={t('cost.debtHelp')}
        />
        {a.maintenanceAdjustedPrice && (
          <Tile
            label={t('cost.adjusted')}
            range={a.maintenanceAdjustedPrice}
            help={t('cost.adjustedHelp')}
            strong
          />
        )}
        <Tile
          label={t('cost.perMonth')}
          range={a.forecastPerMonth}
          exact
          help={t(
            a.runningCostsKnown
              ? 'cost.perMonthHelp'
              : 'cost.perMonthHelpNoRunning',
            {
              years: forecast.horizonYears,
              start: forecast.startYear,
            }
          )}
        />
      </Box>

      {gapLines.length > 0 && (
        <Alert severity="info" variant="outlined">
          <AlertTitle>{t('cost.gapsTitle')}</AlertTitle>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {gapLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </Box>
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={view}
          onChange={(_, v) => v && setView(v)}
          aria-label={t('cost.view.label')}
          sx={{ mb: 2, flexWrap: 'wrap' }}
        >
          <ToggleButton value="paid">{t('cost.view.paid')}</ToggleButton>
          <ToggleButton value="spread">{t('cost.view.spread')}</ToggleButton>
        </ToggleButtonGroup>
        {view === 'paid' ? (
          <>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="baseline"
              flexWrap="wrap"
              useFlexGap
              sx={{ mb: 1 }}
            >
              <Typography component="h3" variant="subtitle1" fontWeight={600}>
                {t('cost.chartTitle')} {forecast.startYear}–{endYear}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('cost.chartScenario')} · {t('cost.total')}{' '}
                {formatSekShort(forecast.total.typical, locale)} (
                {formatSekRange(forecast.total, locale)})
              </Typography>
            </Stack>
            <YearChart years={forecast.years} />
            <Typography
              variant="caption"
              color="text.secondary"
              component="p"
              sx={{ mt: 1 }}
            >
              {t('cost.chartNote')}
            </Typography>
          </>
        ) : (
          <>
            <Typography
              component="h3"
              variant="subtitle1"
              fontWeight={600}
              sx={{ mb: 1 }}
            >
              {t('annual.title')}
            </Typography>
            <AnnualView
              annual={a.annual}
              runningCostsKnown={a.runningCostsKnown}
              labels={labels}
            />
          </>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography
          component="h3"
          variant="subtitle1"
          fontWeight={600}
          sx={{ mb: 1 }}
        >
          {t('cost.debtByType')}
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('cost.part')}</TableCell>
              <TableCell align="right">{t('cost.typical')}</TableCell>
              <TableCell align="right">{t('cost.rangeLabel')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {a.debtByType.map((d) => (
              <TableRow key={d.type}>
                <TableCell>
                  {d.type === 'work_items'
                    ? t('forecastCategory.work_item')
                    : labels.typeLabel(d.type)}
                  {gaps.assumedParts.some((p) => p.type === d.type) && (
                    <AssumedChip />
                  )}
                </TableCell>
                <TableCell align="right">
                  {formatSek(d.typical, locale)}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  {formatSekRange(d, locale)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography
          component="h3"
          variant="subtitle1"
          fontWeight={600}
          sx={{ mb: 1 }}
        >
          {t('cost.items')}
        </Typography>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('cost.item')}</TableCell>
                <TableCell align="right">{t('cost.typical')}</TableCell>
                <TableCell align="right">{t('cost.rangeLabel')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item, i) => {
                const type =
                  item.category === 'running' || item.category === 'capital'
                    ? undefined
                    : item.key
                return (
                  <TableRow key={i}>
                    <TableCell sx={{ verticalAlign: 'top' }}>
                      <Typography variant="body2" component="span">
                        {labels.itemLabel(item)}
                      </Typography>{' '}
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        component="span"
                      >
                        {t(`forecastCategory.${item.category}`)}
                      </Typography>
                      {item.assumed && <AssumedChip />}
                      {item.renewedAs && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`${t('cost.renewedAs')} (${labels.matchText(item.renewedAs, type)})`}
                          sx={{ ml: 1, my: 0.25, maxWidth: '100%' }}
                        />
                      )}
                      {item.flags
                        .filter(
                          (f) =>
                            f.code !== 'assumed_part' &&
                            f.code !== 'cheaper_renewal'
                        )
                        .map((f, j) => (
                          <Typography
                            key={j}
                            variant="caption"
                            color="text.secondary"
                            component="div"
                          >
                            {labels.flagText(f, type)}
                          </Typography>
                        ))}
                    </TableCell>
                    <TableCell align="right" sx={{ verticalAlign: 'top' }}>
                      {formatSek(item.total.typical, locale)}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}
                    >
                      {formatSekRange(item.total, locale)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      <Box>
        {a.flags.map((f, i) => (
          <Typography
            key={i}
            variant="caption"
            color="text.secondary"
            component="p"
          >
            {labels.flagText(f)}
          </Typography>
        ))}
        <Typography variant="caption" color="text.secondary" component="p">
          {t('cost.notModelled')}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="p">
          {t('cost.indexYear', { year: a.priceIndexYear })}
        </Typography>
      </Box>
    </Stack>
  )
}

function AssumedChip() {
  const t = useTranslations('cost')
  return (
    <Tooltip title={t('assumedHelp')}>
      <Chip
        size="small"
        variant="outlined"
        color="warning"
        label={t('assumed')}
        sx={{ ml: 1, my: 0.25 }}
      />
    </Tooltip>
  )
}

function Tile({
  label,
  value,
  range,
  help,
  strong,
  exact,
}: {
  label: string
  value?: string
  range?: Range
  help?: string
  strong?: boolean
  // Small amounts in full kronor.
  exact?: boolean
}) {
  const locale = useLocale()
  const t = useTranslations('cost')
  const fmt = exact ? formatSek : formatSekShort
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        ...(strong && { borderColor: 'primary.main', borderWidth: 2 }),
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant={strong ? 'h5' : 'h6'}
        fontWeight={700}
        sx={{ lineHeight: 1.3 }}
      >
        {range ? fmt(range.typical, locale) : value}
      </Typography>
      {range && (
        <Typography variant="caption" color="text.secondary" component="div">
          {t('rangeLabel')} {fmt(range.low, locale)}–{fmt(range.high, locale)}
        </Typography>
      )}
      {help && (
        <Typography
          variant="caption"
          color="text.secondary"
          component="p"
          sx={{ mt: 0.5 }}
        >
          {help}
        </Typography>
      )}
    </Paper>
  )
}
