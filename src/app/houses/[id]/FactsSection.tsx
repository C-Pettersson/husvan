'use client'

import { useLocale, useTranslations } from 'next-intl'
import {
  Alert,
  Box,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { formatStatistic } from '@/lib/format'
import { trpc } from '@/lib/trpc'
import { useLabels } from '@/lib/labels'

const ANSWER_COLOR = {
  yes: 'success',
  no: 'default',
  unknown: 'default',
} as const

// Features (unknown is not no), heating, bathrooms and flagged risks.
export function FactsSection({
  houseId,
  componentName,
}: {
  houseId: string
  // The name a component has on this page, for risks on a component.
  componentName: (id: string) => string | undefined
}) {
  const t = useTranslations()
  const analysis = trpc.house.analysis.useQuery({ id: houseId })
  const labels = useLabels(analysis.data?.types ?? {})
  if (!analysis.data) return null
  const a = analysis.data
  const features = a.features as Record<string, 'yes' | 'no' | 'unknown'>

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {Object.entries(features).map(([f, answer]) => (
            <Chip
              key={f}
              size="small"
              color={ANSWER_COLOR[answer]}
              variant={answer === 'unknown' ? 'outlined' : 'filled'}
              label={`${t(`feature.${f}`)}: ${t(`featureAnswer.${answer}`)}`}
            />
          ))}
        </Stack>
        <Typography
          variant="caption"
          color="text.secondary"
          component="p"
          sx={{ mt: 1 }}
        >
          {t('facts.note')}
        </Typography>
        <Typography variant="body2" sx={{ mt: 1.5 }}>
          <strong>{t('facts.heating')}:</strong>{' '}
          {a.heating.main.length
            ? a.heating.main.map(labels.typeLabel).join(', ')
            : t('facts.unknownHeating')}
          {a.heating.complementary.length > 0 &&
            ` · ${t('facts.complementary', {
              types: a.heating.complementary.map(labels.typeLabel).join(', '),
            })}`}
        </Typography>
        <Typography variant="body2">
          <strong>{t('facts.bathrooms')}:</strong> {a.bathrooms}
        </Typography>
      </Paper>

      <Box>
        <Typography component="h3" variant="subtitle1" fontWeight={600}>
          {t('risk.title')}
        </Typography>
        {a.risks.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            {t('risk.none')}
          </Typography>
        ) : (
          <Stack spacing={1} sx={{ mt: 1 }}>
            {a.risks.map((r, i) => (
              <Alert key={i} severity="warning" variant="outlined">
                <strong>{t(`risk.${r.kind}`)}</strong>
                {r.kind !== 'radon' &&
                  `: ${
                    (r.componentId && componentName(r.componentId)) ??
                    labels.typeLabel(r.type)
                  }, ${labels.attributeLabel(r.key, r.type)}: ${labels.valueText(r.key, r.value, r.type)}`}
                {r.kind === 'radon' &&
                  ` (${labels.valueText(r.key, r.value)} Bq/m³)`}
              </Alert>
            ))}
            <Typography variant="caption" color="text.secondary">
              {t('risk.note')}
            </Typography>
          </Stack>
        )}
      </Box>
    </Stack>
  )
}

// Statistics for the house's areas, smallest first, each with its level and
// year (CLAUDE.md, "Området"). Never marked better or worse.
export function AreaSection({ houseId }: { houseId: string }) {
  const t = useTranslations('area')
  const locale = useLocale()
  const analysis = trpc.house.analysis.useQuery({ id: houseId })
  if (!analysis.data) return null
  const areas = analysis.data.area.filter((x) => x.statistics.length > 0)
  if (areas.length === 0)
    return <Typography color="text.secondary">{t('none')}</Typography>

  const keys = [
    ...new Set(areas.flatMap((x) => x.statistics.map((s) => s.key))),
  ]
  const sources = [
    ...new Set(
      areas.flatMap((x) =>
        x.statistics.flatMap((s) => (s.source ? [s.source] : []))
      )
    ),
  ]
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell />
              {areas.map((x) => (
                <TableCell key={`${x.level}${x.code}`} align="right">
                  {t(`level.${x.level}`)}
                  {x.level === 'DESO' || x.level === 'POLICE_AREA' ? (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      component="div"
                    >
                      {x.code}
                    </Typography>
                  ) : null}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {keys.map((key) => (
              <TableRow key={key}>
                <TableCell component="th" scope="row">
                  {t.has(`key.${key}`) ? t(`key.${key}`) : key}
                </TableCell>
                {areas.map((x) => {
                  const s = x.statistics.find((s) => s.key === key)
                  return (
                    <TableCell
                      key={`${x.level}${x.code}`}
                      align="right"
                      sx={{ whiteSpace: 'nowrap' }}
                    >
                      {s ? (
                        <>
                          {formatStatistic(s.value, s.unit ?? '', locale)}
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            component="div"
                          >
                            {s.year}
                          </Typography>
                        </>
                      ) : (
                        '–'
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        component="p"
        sx={{ mt: 1 }}
      >
        {t('note')} {t('source', { sources: sources.join('; ') })}
      </Typography>
    </Paper>
  )
}
