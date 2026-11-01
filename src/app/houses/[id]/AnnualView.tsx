'use client'

import { useLocale, useTranslations } from 'next-intl'
import {
  Box,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { formatSek, formatSekRange } from '@/lib/format'
import type { useLabels } from '@/lib/labels'
import type { RouterOutputs } from '@/lib/trpc'
import { CATEGORIES } from './YearChart'

type Annual = RouterOutputs['house']['analysis']['annual']

const COLOR = {
  replacement: CATEGORIES.find((c) => c.key === 'replacement')!.color,
  repaint: CATEGORIES.find((c) => c.key === 'repaint')!.color,
}

// Every replacement and repaint divided by the years it lasts, so the cost
// per year does not depend on when a part happens to fall due.
export default function AnnualView({
  annual,
  runningCostsKnown,
  labels,
}: {
  annual: Annual
  runningCostsKnown: boolean
  labels: ReturnType<typeof useLabels>
}) {
  const t = useTranslations()
  const locale = useLocale()
  const max = Math.max(...annual.parts.map((p) => p.perYear.typical), 1)
  const kinds = [...new Set(annual.parts.map((p) => p.kind))]
  const years = (y: { low: number; typical: number; high: number }) =>
    y.low === y.high
      ? t('annual.years', { years: y.typical })
      : t('annual.yearsRange', { min: y.high, max: y.low })

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="body2" color="text.secondary">
          {t('annual.perMonth')}
        </Typography>
        <Typography variant="h5" fontWeight={700}>
          {formatSek(annual.perMonth.typical, locale)}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div">
          {t('cost.rangeLabel')} {formatSek(annual.perMonth.low, locale)}–
          {formatSek(annual.perMonth.high, locale)}
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          {[
            t('annual.part.wear', {
              sek: formatSek(annual.wear.typical, locale),
            }),
            runningCostsKnown &&
              t('annual.part.running', {
                sek: formatSek(annual.running.typical, locale),
              }),
            annual.capital > 0 &&
              t('annual.part.capital', {
                sek: formatSek(annual.capital, locale),
              }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Typography>
        {!runningCostsKnown && (
          <Typography variant="caption" color="warning.dark" component="div">
            {t('cost.gap.runningUnknown')}
          </Typography>
        )}
      </Box>

      {kinds.length > 1 && (
        <Stack direction="row" spacing={2} component="ul" sx={{ p: 0, m: 0 }}>
          {kinds.map((k) => (
            <Stack
              key={k}
              component="li"
              direction="row"
              spacing={0.75}
              alignItems="center"
              sx={{ listStyle: 'none' }}
            >
              <Box
                sx={{ width: 10, height: 10, borderRadius: '2px' }}
                style={{ background: COLOR[k] }}
              />
              <Typography variant="caption" color="text.secondary">
                {t(`forecastCategory.${k}`)}
              </Typography>
            </Stack>
          ))}
        </Stack>
      )}

      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('cost.part')}</TableCell>
              <TableCell align="right">{t('annual.cost')}</TableCell>
              <TableCell align="right">{t('annual.lasts')}</TableCell>
              <TableCell sx={{ minWidth: 180 }}>
                {t('annual.perYear')}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {annual.parts.map((p, i) => (
              <TableRow key={i}>
                <TableCell sx={{ verticalAlign: 'top' }}>
                  {labels.itemLabel({
                    category: p.kind,
                    key: p.type,
                    name: p.name ?? undefined,
                  })}
                  {p.kind === 'repaint' && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      component="span"
                    >
                      {' '}
                      {t('forecastCategory.repaint')}
                    </Typography>
                  )}
                  {p.assumed && (
                    <Chip
                      size="small"
                      variant="outlined"
                      color="warning"
                      label={t('cost.assumed')}
                      sx={{ ml: 1, my: 0.25 }}
                    />
                  )}
                  {p.renewedAs && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      component="div"
                    >
                      {t('annual.renewedAs', {
                        how: labels.matchText(p.renewedAs, p.type),
                      })}
                    </Typography>
                  )}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}
                >
                  {formatSek(p.cost.typical, locale)}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}
                >
                  {years(p.years)}
                </TableCell>
                <TableCell sx={{ verticalAlign: 'top' }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box sx={{ flex: 1, minWidth: 60 }}>
                      <Box
                        sx={{
                          height: 10,
                          borderRadius: '0 4px 4px 0',
                        }}
                        style={{
                          width: `${(p.perYear.typical / max) * 100}%`,
                          background: COLOR[p.kind],
                        }}
                      />
                    </Box>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      sx={{ whiteSpace: 'nowrap' }}
                    >
                      {formatSek(p.perYear.typical, locale)}
                    </Typography>
                  </Stack>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    component="div"
                    sx={{ textAlign: 'right' }}
                  >
                    {formatSekRange(p.perYear, locale)}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      <Typography variant="caption" color="text.secondary">
        {t('annual.note')}
      </Typography>
    </Stack>
  )
}
