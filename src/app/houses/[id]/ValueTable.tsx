'use client'

import { useLocale, useTranslations } from 'next-intl'
import {
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
} from '@mui/material'
import type { KeyValueView, ValueRow } from '@/server/houses/getHouse'
import {
  formatValue,
  keyLabel,
  numberFormat,
  type AttributeDefinition,
} from './format'

export type DocumentRef = { type: string; title: string | null }

// Values with where each came from. Rows from a previewed draft are marked,
// so the draft and the approved data render through the same table.
export default function ValueTable({
  values,
  attributes,
  documents,
}: {
  values: KeyValueView[]
  attributes?: Record<string, AttributeDefinition>
  documents: Record<string, DocumentRef>
}) {
  const t = useTranslations()
  const locale = useLocale()

  const describe = (row: ValueRow) =>
    [
      t(`source.${row.source.toLowerCase()}`),
      row.documentId && documents[row.documentId]
        ? t(`documentType.${documents[row.documentId].type.toLowerCase()}`)
        : null,
      row.confidence === null
        ? null
        : t('houseDetail.confidence', {
            value: numberFormat(locale).format(
              Math.round(row.confidence * 100)
            ),
          }),
    ]
      .filter(Boolean)
      .join(' · ')

  const format = (row: ValueRow) =>
    formatValue(row.value, {
      key: row.key,
      unit: row.unit,
      attribute: attributes?.[row.key],
      locale,
      t,
    })

  return (
    <Table size="small">
      <TableBody>
        {values.map(({ key, current, alternatives }) => (
          <TableRow
            key={key}
            sx={
              current.draft
                ? {
                    boxShadow: (theme) =>
                      `inset 3px 0 ${theme.palette.warning.main}`,
                  }
                : undefined
            }
          >
            <TableCell
              component="th"
              scope="row"
              sx={{
                width: '38%',
                verticalAlign: 'top',
                color: 'text.secondary',
              }}
            >
              {keyLabel(key, { attribute: attributes?.[key], locale, t })}
            </TableCell>
            <TableCell sx={{ verticalAlign: 'top' }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" fontWeight={500}>
                  {format(current)}
                </Typography>
                {current.draft && (
                  <Chip
                    size="small"
                    color="warning"
                    label={t('houseDetail.draft')}
                  />
                )}
              </Stack>
              <Typography
                variant="caption"
                color="text.secondary"
                component="div"
              >
                {describe(current)}
              </Typography>
              {current.quote && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="div"
                  title={current.quote}
                  sx={{
                    fontStyle: 'italic',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  ”{current.quote}”
                </Typography>
              )}
              {alternatives.map((alt) => (
                <Typography
                  key={alt.id}
                  variant="caption"
                  color="text.secondary"
                  component="div"
                >
                  {t('houseDetail.alternative', {
                    value: format(alt),
                    source: describe(alt),
                  })}
                </Typography>
              ))}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
