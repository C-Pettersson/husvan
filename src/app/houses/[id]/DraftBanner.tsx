'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
} from '@mui/material'
import { trpc } from '@/lib/trpc'

type Draft = {
  id: string
  counts: { components: number; observations: number; workItems: number }
}

// Open drafts of a house: show one in place, then approve or reject it.
export default function DraftBanner({
  houseId,
  drafts,
  preview,
}: {
  houseId: string
  drafts: Draft[]
  preview: string | null
}) {
  const t = useTranslations('houseDetail')
  const router = useRouter()
  const utils = trpc.useUtils()
  const [confirmReject, setConfirmReject] = useState(false)
  const confirm = trpc.house.confirmDraft.useMutation({
    onSuccess: async () => {
      setConfirmReject(false)
      await utils.house.invalidate()
      router.replace(`/houses/${houseId}`)
    },
  })

  const shown = drafts.find((d) => d.id === preview)
  if (!shown) {
    return drafts.map((d) => (
      <Alert
        key={d.id}
        severity="info"
        sx={{ mb: 3 }}
        action={
          <Button
            color="inherit"
            size="small"
            href={`/houses/${houseId}?draft=${d.id}`}
          >
            {t('showDraft')}
          </Button>
        }
      >
        {t('draftWaiting', d.counts)}
      </Alert>
    ))
  }

  const decide = (decision: 'approve' | 'reject') =>
    confirm.mutate({ changesetId: shown.id, decision })

  return (
    <>
      <Alert severity="warning" sx={{ mb: 3 }}>
        {t('previewing', shown.counts)}
        <Stack
          direction="row"
          spacing={1}
          sx={{ mt: 1.5 }}
          flexWrap="wrap"
          useFlexGap
        >
          <Button
            variant="contained"
            color="success"
            size="small"
            disabled={confirm.isPending}
            onClick={() => decide('approve')}
          >
            {t('approve')}
          </Button>
          <Button
            variant="outlined"
            color="error"
            size="small"
            disabled={confirm.isPending}
            onClick={() => setConfirmReject(true)}
          >
            {t('reject')}
          </Button>
          <Button size="small" color="inherit" href={`/houses/${houseId}`}>
            {t('hideDraft')}
          </Button>
        </Stack>
        {confirm.isError && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {t('decisionFailed')}
          </Alert>
        )}
      </Alert>
      <Dialog open={confirmReject} onClose={() => setConfirmReject(false)}>
        <DialogTitle>{t('rejectTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('rejectBody')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmReject(false)}>{t('cancel')}</Button>
          <Button
            color="error"
            disabled={confirm.isPending}
            onClick={() => decide('reject')}
          >
            {t('reject')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
