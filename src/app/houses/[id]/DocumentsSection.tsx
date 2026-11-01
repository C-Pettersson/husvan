'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Alert,
  Button,
  Link,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { trpc } from '@/lib/trpc'

const TYPES = [
  'LISTING',
  'INSPECTION',
  'PIPE_INSPECTION',
  'ELECTRICAL_INSPECTION',
  'ENERGY_CERTIFICATE',
  'INVOICE',
  'RECEIPT',
  'MANUAL',
  'WARRANTY',
  'DRAWING',
  'PHOTO',
  'OTHER',
] as const

const ACCEPT =
  'application/pdf,image/jpeg,image/png,image/webp,image/heic,text/plain'

type Document = {
  id: string
  type: string
  title: string | null
  sourceUrl: string | null
  filename: string | null
  documentDate: Date | null
  hasFile: boolean
}

// The house's documents, with the original file where it is uploaded. A
// file is matched to the document Claude saved by its sha256, to the
// document the user picks, or becomes a new document.
export default function DocumentsSection({
  houseId,
  documents,
}: {
  houseId: string
  documents: Document[]
}) {
  const t = useTranslations()
  const utils = trpc.useUtils()
  const input = useRef<HTMLInputElement>(null)
  const [target, setTarget] = useState<string | null>(null)
  const [type, setType] = useState<(typeof TYPES)[number]>('INSPECTION')
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'uploading' }
    | { kind: 'done'; matched: string }
    | { kind: 'error'; error: string }
  >({ kind: 'idle' })

  const pick = (documentId: string | null) => {
    setTarget(documentId)
    input.current?.click()
  }

  const upload = async (file: File) => {
    setState({ kind: 'uploading' })
    const form = new FormData()
    form.set('file', file)
    if (target) form.set('documentId', target)
    else form.set('type', type)
    const response = await fetch(`/api/houses/${houseId}/documents`, {
      method: 'POST',
      body: form,
    }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (!response?.ok) {
      setState({ kind: 'error', error: body?.error ?? 'generic' })
      return
    }
    setState({ kind: 'done', matched: body.matched })
    await utils.house.invalidate()
  }

  return (
    <Stack spacing={2}>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void upload(file)
        }}
      />
      {documents.length === 0 ? (
        <Typography color="text.secondary">
          {t('houseDetail.noDocuments')}
        </Typography>
      ) : (
        <Paper variant="outlined">
          <List disablePadding>
            {documents.map((d) => (
              <ListItem
                key={d.id}
                divider
                secondaryAction={
                  d.hasFile ? (
                    <Button
                      size="small"
                      href={`/api/documents/${d.id}/file`}
                      target="_blank"
                      rel="noopener"
                    >
                      {t('upload.open')}
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      disabled={state.kind === 'uploading'}
                      onClick={() => pick(d.id)}
                      aria-label={t('upload.attachLabel', {
                        title: d.title ?? d.filename ?? d.type,
                      })}
                    >
                      {t('upload.attach')}
                    </Button>
                  )
                }
                sx={{ pr: 16 }}
              >
                <ListItemText
                  primary={
                    d.sourceUrl ? (
                      <Link
                        href={d.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {d.title ?? d.sourceUrl}
                      </Link>
                    ) : (
                      (d.title ?? d.filename)
                    )
                  }
                  secondary={[
                    t(`documentType.${d.type.toLowerCase()}`),
                    d.documentDate?.toISOString().slice(0, 10),
                    d.filename,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
      >
        <TextField
          select
          size="small"
          label={t('upload.type')}
          value={type}
          onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}
          sx={{ minWidth: 200 }}
        >
          {TYPES.map((x) => (
            <MenuItem key={x} value={x}>
              {t(`documentType.${x.toLowerCase()}`)}
            </MenuItem>
          ))}
        </TextField>
        <Button
          variant="outlined"
          disabled={state.kind === 'uploading'}
          onClick={() => pick(null)}
        >
          {t('upload.new')}
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {t('upload.hint')}
      </Typography>
      {state.kind === 'uploading' && (
        <Alert severity="info">{t('upload.uploading')}</Alert>
      )}
      {state.kind === 'done' && (
        <Alert severity="success" onClose={() => setState({ kind: 'idle' })}>
          {t(`upload.done.${state.matched}`)}
        </Alert>
      )}
      {state.kind === 'error' && (
        <Alert severity="error" onClose={() => setState({ kind: 'idle' })}>
          {t.has(`upload.error.${state.error}`)
            ? t(`upload.error.${state.error}`)
            : t('upload.error.generic')}
        </Alert>
      )}
    </Stack>
  )
}
