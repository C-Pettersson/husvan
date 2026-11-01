'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  Box,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { formatSek, formatSekShort } from '@/lib/format'

// Categorical slots in fixed order, validated for colour-vision deficiency
// on the white card (dataviz reference palette). Three are below 3:1
// against white, so the chart has a legend and a table view.
export const CATEGORIES = [
  { key: 'running', color: '#2a78d6' },
  { key: 'replacement', color: '#eb6834' },
  { key: 'repaint', color: '#1baf7a' },
  { key: 'work_item', color: '#eda100' },
  { key: 'inspection', color: '#e87ba4' },
  { key: 'capital', color: '#008300' },
] as const

type Year = {
  year: number
  total: { low: number; typical: number; high: number }
  typicalByCategory: Partial<Record<string, number>>
}

const W = 640
const H = 220
const PAD = { top: 12, right: 8, bottom: 24, left: 56 }
const GAP = 2

// Round the axis to a step of 1, 2 or 5 times a power of ten.
function niceMax(v: number) {
  if (v <= 0) return 1
  const step = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= v) return m * step
  return 10 * step
}

export default function YearChart({ years }: { years: Year[] }) {
  const t = useTranslations('cost')
  const tc = useTranslations('forecastCategory')
  const locale = useLocale()
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)

  const used = CATEGORIES.filter((c) =>
    years.some((y) => (y.typicalByCategory[c.key] ?? 0) > 0)
  )
  const max = niceMax(Math.max(...years.map((y) => y.total.typical), 0))
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const band = innerW / years.length
  const barW = Math.min(24, band * 0.7)
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)
  const labelEvery = Math.ceil(years.length / 8)
  const shown = hover === null ? null : years[hover]

  return (
    <Box>
      <Stack
        direction="row"
        spacing={2}
        flexWrap="wrap"
        useFlexGap
        sx={{ mb: 1 }}
        component="ul"
        aria-label={t('chartTitle')}
        style={{ listStyle: 'none', padding: 0, margin: 0 }}
      >
        {used.map((c) => (
          <Stack
            key={c.key}
            component="li"
            direction="row"
            spacing={0.75}
            alignItems="center"
          >
            <Box
              sx={{ width: 10, height: 10, borderRadius: '2px' }}
              style={{ background: c.color }}
            />
            <Typography variant="caption" color="text.secondary">
              {tc(c.key)}
            </Typography>
          </Stack>
        ))}
      </Stack>

      <Box sx={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={t('chartTitle')}
          style={{ display: 'block', overflow: 'visible' }}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(v)}
                y2={y(v)}
                stroke="#e6e4df"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(v)}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                fill="#6b6a66"
              >
                {formatSekShort(v, locale)}
              </text>
            </g>
          ))}
          {years.map((yr, i) => {
            const x = PAD.left + i * band + (band - barW) / 2
            let base = 0
            const segments = used.flatMap((c) => {
              const v = yr.typicalByCategory[c.key] ?? 0
              if (v <= 0) return []
              const s = { color: c.color, from: base, to: base + v }
              base += v
              return [s]
            })
            return (
              <g
                key={yr.year}
                opacity={hover === null || hover === i ? 1 : 0.55}
              >
                {segments.map((s, j) => {
                  const top = y(s.to)
                  // A surface gap between stacked segments.
                  const bottom = y(s.from) - (j > 0 ? GAP : 0)
                  const h = Math.max(0, bottom - top)
                  const last = j === segments.length - 1
                  const r = last ? Math.min(4, h, barW / 2) : 0
                  return (
                    <path
                      key={j}
                      fill={s.color}
                      d={`M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${bottom} Z`}
                    />
                  )
                })}
                {i % labelEvery === 0 && (
                  <text
                    x={x + barW / 2}
                    y={H - 6}
                    textAnchor="middle"
                    fontSize={11}
                    fill="#6b6a66"
                  >
                    {yr.year}
                  </text>
                )}
                {/* Hit target wider than the bar. */}
                <rect
                  x={PAD.left + i * band}
                  y={PAD.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${yr.year}: ${formatSek(yr.total.typical, locale)}`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                />
              </g>
            )
          })}
        </svg>
        {shown && hover !== null && (
          <Box
            role="status"
            sx={{
              position: 'absolute',
              top: 0,
              left: `${((PAD.left + (hover + 0.5) * band) / W) * 100}%`,
              transform:
                hover > years.length / 2
                  ? 'translateX(calc(-100% - 12px))'
                  : 'translateX(12px)',
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              boxShadow: 2,
              px: 1.5,
              py: 1,
              pointerEvents: 'none',
              minWidth: 180,
              zIndex: 1,
            }}
          >
            <Typography variant="subtitle2">{shown.year}</Typography>
            {used
              .filter((c) => (shown.typicalByCategory[c.key] ?? 0) > 0)
              .map((c) => (
                <Stack
                  key={c.key}
                  direction="row"
                  spacing={1}
                  alignItems="center"
                >
                  <Box
                    sx={{ width: 10, height: 2 }}
                    style={{ background: c.color }}
                  />
                  <Typography variant="body2" fontWeight={600}>
                    {formatSek(shown.typicalByCategory[c.key]!, locale)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {tc(c.key)}
                  </Typography>
                </Stack>
              ))}
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              <strong>{formatSek(shown.total.typical, locale)}</strong>{' '}
              {t('total').toLowerCase()}
            </Typography>
          </Box>
        )}
      </Box>

      <Button size="small" onClick={() => setTable(!table)} sx={{ mt: 1 }}>
        {table ? t('hideTable') : t('showTable')}
      </Button>
      {table && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('year')}</TableCell>
                {used.map((c) => (
                  <TableCell key={c.key} align="right">
                    {tc(c.key)}
                  </TableCell>
                ))}
                <TableCell align="right">{t('typical')}</TableCell>
                <TableCell align="right">{t('rangeLabel')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {years.map((yr) => (
                <TableRow key={yr.year}>
                  <TableCell>{yr.year}</TableCell>
                  {used.map((c) => (
                    <TableCell key={c.key} align="right">
                      {formatSek(yr.typicalByCategory[c.key] ?? 0, locale)}
                    </TableCell>
                  ))}
                  <TableCell align="right">
                    {formatSek(yr.total.typical, locale)}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {formatSekShort(yr.total.low, locale)}–
                    {formatSekShort(yr.total.high, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  )
}
