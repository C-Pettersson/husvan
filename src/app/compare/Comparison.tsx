'use client'

import { useLocale, useTranslations } from 'next-intl'
import {
  Alert,
  Box,
  CircularProgress,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import {
  formatSek,
  formatSekRange,
  formatSekShort,
  formatStatistic,
  keyLabel,
  numberFormat,
  type Range,
} from '@/lib/format'
import { useLabels } from '@/lib/labels'
import { trpc } from '@/lib/trpc'

// Houses side by side, cheapest maintenance-adjusted price first, then why
// they differ (CLAUDE.md, "Förklaring av prisskillnad"). Disclosure is
// uneven, so an uninspected house shows unknown findings, not none.
export default function Comparison({ ids }: { ids: string[] }) {
  const t = useTranslations()
  const locale = useLocale()
  const compare = trpc.house.compare.useQuery({ ids })
  const labels = useLabels(compare.data?.types ?? {})

  if (compare.isPending) return <CircularProgress />
  if (compare.isError)
    return (
      <Alert severity="error">
        {compare.error.data?.code === 'NOT_FOUND'
          ? t('houseDetail.notFound')
          : t('error.generic')}
      </Alert>
    )

  const c = compare.data
  const houses = c.houses
  const [base] = houses
  const signed = (sek: number) =>
    `${sek > 0 ? '+' : sek < 0 ? '−' : '±'}${formatSekShort(Math.abs(sek), locale)}`
  // Small amounts, per month, in full kronor.
  const range = (r: Range | null, exact = false) =>
    r ? (
      <>
        <strong>
          {(exact ? formatSek : formatSekShort)(r.typical, locale)}
        </strong>
        <Typography variant="caption" color="text.secondary" component="div">
          {exact
            ? `${formatSek(r.low, locale)}–${formatSek(r.high, locale)}`
            : formatSekRange(r, locale)}
        </Typography>
      </>
    ) : (
      '–'
    )
  const unknownRunning = houses.filter((h) => !h.runningCostsKnown)

  const itemLabel = (item: string) => {
    const [category, key] = item.split(':')
    if (category === 'work_item') return t(`compare.workItems.${key}`)
    if (category === 'running' || category === 'capital')
      return labels.itemLabel({ category, key })
    return `${t(`forecastCategory.${category}`)}: ${labels.typeLabel(key)}`
  }

  // The smallest area with the statistic, per house.
  const areaKeys = [
    ...new Set(
      houses.flatMap((h) =>
        h.area.flatMap((a) => a.statistics.map((s) => s.key))
      )
    ),
  ]
  const areaCell = (h: (typeof houses)[number], key: string) => {
    for (const a of h.area) {
      const s = a.statistics.find((x) => x.key === key)
      if (s)
        return (
          <>
            {formatStatistic(s.value, s.unit ?? '', locale)}
            <Typography
              variant="caption"
              color="text.secondary"
              component="div"
            >
              {t(`area.level.${a.level}`)} {s.year}
            </Typography>
          </>
        )
    }
    return '–'
  }

  const head = (
    <TableHead>
      <TableRow>
        <TableCell />
        {houses.map((h) => (
          <TableCell key={h.id} sx={{ minWidth: 140, verticalAlign: 'top' }}>
            <Link href={`/houses/${h.id}`} fontWeight={600} underline="hover">
              {h.address.split(',')[0]}
            </Link>
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  )
  const row = (
    label: string,
    cell: (h: (typeof houses)[number]) => React.ReactNode
  ) => (
    <TableRow>
      <TableCell component="th" scope="row" sx={{ color: 'text.secondary' }}>
        {label}
      </TableCell>
      {houses.map((h) => (
        <TableCell key={h.id} sx={{ verticalAlign: 'top' }}>
          {cell(h)}
        </TableCell>
      ))}
    </TableRow>
  )

  return (
    <Stack spacing={4}>
      <Typography color="text.secondary">{t('compare.sorted')}</Typography>

      <Panel>
        <Table size="small">
          {head}
          <TableBody>
            {row(t('cost.price'), (h) =>
              h.price ? (
                <>
                  <strong>{formatSek(h.price.sek, locale)}</strong>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    component="div"
                  >
                    {keyLabel(h.price.kind, { locale, t })}
                  </Typography>
                </>
              ) : (
                t('cost.noPrice')
              )
            )}
            {row(t('cost.debt'), (h) => range(h.maintenanceDebt))}
            {row(t('cost.adjusted'), (h) => range(h.maintenanceAdjustedPrice))}
            {row(t('cost.perMonth'), (h) =>
              h.runningCostsKnown ? (
                range(h.forecastPerMonth, true)
              ) : (
                <>
                  {range(h.forecastPerMonth, true)}
                  <Typography variant="caption" color="warning.dark">
                    {t('cost.gap.runningUnknown')}
                  </Typography>
                </>
              )
            )}
            {row(t('compare.annualPerMonth'), (h) => (
              <>
                {range(h.annualCost.perMonth, true)}
                {!h.runningCostsKnown && (
                  <Typography variant="caption" color="warning.dark">
                    {t('cost.gap.runningUnknown')}
                  </Typography>
                )}
              </>
            ))}
            {row(t('cost.ratio'), (h) =>
              h.priceToAssessedValue
                ? numberFormat(locale).format(
                    Math.round(h.priceToAssessedValue.ratio * 100) / 100
                  )
                : '–'
            )}
            {row(t('cost.gapsTitle'), (h) => (
              <Typography variant="caption" component="div">
                {[
                  !h.gaps.inspected && `${t('compare.notInspected')}.`,
                  h.gaps.assumedParts.length > 0 &&
                    t('cost.gap.assumedParts', {
                      parts: h.gaps.assumedParts
                        .map((p) => labels.typeLabel(p.type))
                        .join(', '),
                    }),
                  h.gaps.workItemsWithoutCost > 0 &&
                    t('cost.gap.workItemsWithoutCost', {
                      count: h.gaps.workItemsWithoutCost,
                    }),
                ]
                  .filter(Boolean)
                  .map((line) => (
                    <div key={String(line)}>{line}</div>
                  ))}
              </Typography>
            ))}
          </TableBody>
        </Table>
        {unknownRunning.length > 0 && (
          <Alert severity="warning" variant="outlined" sx={{ mt: 2 }}>
            {t('compare.runningUnknownNote', {
              addresses: unknownRunning
                .map((h) => h.address.split(',')[0])
                .join(', '),
            })}
          </Alert>
        )}
      </Panel>

      <Box>
        <Heading>
          {t('compare.againstFirst', { address: base.address.split(',')[0] })}
        </Heading>
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
          }}
        >
          {c.againstFirst.map((d) => (
            <Paper key={d.id} variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                {d.address.split(',')[0]}
              </Typography>
              <Table size="small">
                <TableBody>
                  <TableRow>
                    <TableCell>{t('compare.priceDiff')}</TableCell>
                    <TableCell align="right">
                      {d.price === null ? '–' : signed(d.price)}
                    </TableCell>
                  </TableRow>
                  {d.debtByType.map((p) => (
                    <TableRow key={p.type}>
                      <TableCell sx={{ pl: 3, color: 'text.secondary' }}>
                        {p.type === 'other'
                          ? t('compare.other')
                          : p.type === 'work_items'
                            ? t('forecastCategory.work_item')
                            : labels.typeLabel(p.type)}
                      </TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary' }}>
                        {signed(p.sek)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell>{t('compare.debtDiff')}</TableCell>
                    <TableCell align="right">{signed(d.debt)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>
                      {t('compare.adjustedDiff')}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {d.adjustedPrice === null ? '–' : signed(d.adjustedPrice)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Paper>
          ))}
        </Box>
      </Box>

      <Box>
        <Heading>{t('compare.findings')}</Heading>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {t('compare.findingsNote')}
        </Typography>
        <Panel>
          <Table size="small">
            {head}
            <TableBody>
              {c.inspectionFindings.map((f) => (
                <TableRow key={f.componentType}>
                  <TableCell
                    component="th"
                    scope="row"
                    sx={{ color: 'text.secondary' }}
                  >
                    {f.componentType === 'house'
                      ? t('compare.wholeHouse')
                      : labels.typeLabel(f.componentType)}
                  </TableCell>
                  {f.byHouse.map((cell, i) => (
                    <TableCell key={houses[i].id} sx={{ verticalAlign: 'top' }}>
                      {cell === null ? (
                        <Typography variant="body2" color="warning.dark">
                          {t('compare.notInspected')}
                        </Typography>
                      ) : cell.items === 0 ? (
                        t('compare.noFindings')
                      ) : (
                        <>
                          {t('compare.findingsCell', { items: cell.items })}
                          {cell.typicalSek > 0 &&
                            ` · ${formatSekShort(cell.typicalSek, locale)}`}
                          {cell.unpriced > 0 && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              component="div"
                            >
                              {t('compare.unpriced', { count: cell.unpriced })}
                            </Typography>
                          )}
                        </>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </Box>

      <Box>
        <Heading>{t('compare.largest')}</Heading>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {t('compare.largestNote')}
        </Typography>
        <Panel>
          <Table size="small">
            {head}
            <TableBody>
              {c.largestForecastDifferences.map((d) => (
                <TableRow key={d.item}>
                  <TableCell
                    component="th"
                    scope="row"
                    sx={{ color: 'text.secondary' }}
                  >
                    {itemLabel(d.item)}
                  </TableCell>
                  {d.sek.map((sek, i) => (
                    <TableCell key={houses[i].id}>
                      {sek === null
                        ? t('compare.runningUnknown')
                        : formatSek(sek, locale)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </Box>

      <Box>
        <Heading>{t('compare.features')}</Heading>
        <Panel>
          <Table size="small">
            {head}
            <TableBody>
              {Object.keys(base.features).map((f) => (
                <TableRow key={f}>
                  <TableCell
                    component="th"
                    scope="row"
                    sx={{ color: 'text.secondary' }}
                  >
                    {t(`feature.${f}`)}
                  </TableCell>
                  {houses.map((h) => {
                    const answer = (h.features as Record<string, string>)[f]
                    return (
                      <TableCell
                        key={h.id}
                        sx={{
                          color:
                            answer === 'unknown' ? 'text.secondary' : undefined,
                        }}
                      >
                        {t(`featureAnswer.${answer}`)}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
              {row(t('compare.risks'), (h) =>
                h.risks.length === 0
                  ? '–'
                  : h.risks.map((r, i) => (
                      <Typography key={i} variant="body2">
                        {t(`risk.${r.kind}`)}
                        {r.kind !== 'radon' && `: ${labels.typeLabel(r.type)}`}
                      </Typography>
                    ))
              )}
            </TableBody>
          </Table>
        </Panel>
      </Box>

      <Box>
        <Heading>{t('compare.area')}</Heading>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {t('area.note')}
        </Typography>
        <Panel>
          {areaKeys.length === 0 ? (
            <Typography color="text.secondary">
              {t('compare.noArea')}
            </Typography>
          ) : (
            <Table size="small">
              {head}
              <TableBody>
                {areaKeys.map((key) => (
                  <TableRow key={key}>
                    <TableCell
                      component="th"
                      scope="row"
                      sx={{ color: 'text.secondary' }}
                    >
                      {t.has(`area.key.${key}`) ? t(`area.key.${key}`) : key}
                    </TableCell>
                    {houses.map((h) => (
                      <TableCell key={h.id}>{areaCell(h, key)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      </Box>

      <Typography variant="caption" color="text.secondary">
        {t('cost.notModelled')}
      </Typography>
    </Stack>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <Typography component="h2" variant="h5" sx={{ mb: 1.5 }}>
      {children}
    </Typography>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, overflowX: 'auto' }}>
      {children}
    </Paper>
  )
}
