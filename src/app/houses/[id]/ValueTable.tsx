'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  Box,
  Chip,
  IconButton,
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
} from '@/lib/format'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import EditOutlined from '@mui/icons-material/EditOutlined'
import { EditValueDialog, RetractDialog, type ValueKind } from './EditValue'

export type DocumentRef = { type: string; title: string | null }

// Values with where each came from. Rows from a previewed draft are marked,
// so the draft and the approved data render through the same table. With
// edit, the user can set their own value or retract the current one.
export default function ValueTable({
  values,
  attributes,
  documents,
  edit,
}: {
  values: KeyValueView[]
  attributes?: Record<string, AttributeDefinition>
  documents: Record<string, DocumentRef>
  edit?: {
    houseId: string
    componentId?: string
    kindOf: (key: string) => ValueKind
  }
}) {
  const t = useTranslations()
  const locale = useLocale()
  const [editing, setEditing] = useState<KeyValueView | null>(null)
  const [retracting, setRetracting] = useState<KeyValueView | null>(null)
  const label = (key: string) =>
    keyLabel(key, { attribute: attributes?.[key], locale, t })

  const describe = (row: ValueRow) =>
    [
      t(`source.${row.source.toLowerCase()}`),
      row.documentId && documents[row.documentId]
        ? t(`documentType.${documents[row.documentId].type.toLowerCase()}`)
        : null,
      // The user's own values are certain; saying so is noise.
      row.confidence === null || row.source === 'USER'
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
    <>
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
                {label(key)}
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
                  {edit && !current.draft && (
                    <Box sx={{ ml: 'auto !important', whiteSpace: 'nowrap' }}>
                      <IconButton
                        size="small"
                        aria-label={t('edit.editLabel', { key: label(key) })}
                        onClick={() =>
                          setEditing({ key, current, alternatives })
                        }
                      >
                        <EditOutlined fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label={t('edit.retractLabel', { key: label(key) })}
                        onClick={() =>
                          setRetracting({ key, current, alternatives })
                        }
                      >
                        <DeleteOutline fontSize="small" />
                      </IconButton>
                    </Box>
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
      {edit && editing && (
        <EditValueDialog
          target={{ houseId: edit.houseId, componentId: edit.componentId }}
          title={t('edit.title', { key: label(editing.key) })}
          fixedKey={{ key: editing.key, kind: edit.kindOf(editing.key) }}
          value={editing.current.value}
          onClose={() => setEditing(null)}
        />
      )}
      {edit && retracting && (
        <RetractDialog
          houseId={edit.houseId}
          observationId={retracting.current.id}
          title={t('edit.retractTitle')}
          body={t('edit.retractBody')}
          confirm={t('edit.retract')}
          onClose={() => setRetracting(null)}
        />
      )}
    </>
  )
}
