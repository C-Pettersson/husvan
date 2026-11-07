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

// A key the library does not know is shown as is, like radon_measurement_date.
// Offer a line break after each underscore so it wraps at word boundaries.
function breakable(text: string) {
  const parts = text.split('_')
  return parts.flatMap((part, i) =>
    i < parts.length - 1 ? [part, '_', <wbr key={i} />] : [part]
  )
}

// Values with where each came from. Rows from a previewed draft are marked,
// so the draft and the approved data render through the same table. With
// edit, the user can set their own value or retract the current one; with
// edit.draftId, a draft row can be corrected or left out of the draft too.
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
    draftId?: string
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
      <Table
        size="small"
        sx={{
          // Fixed layout keeps the label column at its share of the width, so
          // a long label or value wraps instead of pushing the table past its
          // card on a phone.
          tableLayout: 'fixed',
          '& td, & th': {
            px: { xs: 1, sm: 2 },
            overflowWrap: 'anywhere',
          },
        }}
      >
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
                {breakable(label(key))}
              </TableCell>
              <TableCell sx={{ verticalAlign: 'top' }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  flexWrap="wrap"
                  columnGap={1}
                >
                  <Typography
                    variant="body2"
                    fontWeight={500}
                    sx={{ minWidth: 0 }}
                  >
                    {format(current)}
                  </Typography>
                  {current.draft && (
                    <Chip
                      size="small"
                      color="warning"
                      label={t('houseDetail.draft')}
                    />
                  )}
                  {edit && (!current.draft || edit.draftId) && (
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
                        aria-label={t(
                          current.draft
                            ? 'edit.removeFromDraftLabel'
                            : 'edit.retractLabel',
                          { key: label(key) }
                        )}
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
          draft={
            editing.current.draft && edit.draftId
              ? { draftId: edit.draftId, replaces: editing.current.id }
              : undefined
          }
          title={t('edit.title', { key: label(editing.key) })}
          fixedKey={{ key: editing.key, kind: edit.kindOf(editing.key) }}
          value={editing.current.value}
          onClose={() => setEditing(null)}
        />
      )}
      {edit && retracting && retracting.current.draft && edit.draftId && (
        <RetractDialog
          houseId={edit.houseId}
          draftId={edit.draftId}
          observationId={retracting.current.id}
          title={t('edit.removeValueFromDraftTitle')}
          body={t('edit.removeValueFromDraftBody')}
          confirm={t('edit.removeFromDraft')}
          onClose={() => setRetracting(null)}
        />
      )}
      {edit && retracting && !retracting.current.draft && (
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
