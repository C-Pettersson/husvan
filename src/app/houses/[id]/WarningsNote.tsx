'use client'

import { useTranslations } from 'next-intl'
import { Alert, AlertTitle, List, ListItem } from '@mui/material'
import type { Warning } from '@/server/houses/checks'

// What looks wrong or incomplete in the stored values (checks.ts). The web
// only says so; the user corrects the value on the Huset tab or asks Claude.
export default function WarningsNote({ warnings }: { warnings: Warning[] }) {
  const t = useTranslations('warning')
  if (!warnings.length) return null
  return (
    <Alert severity="warning" sx={{ mb: 3 }}>
      <AlertTitle>{t('title', { count: warnings.length })}</AlertTitle>
      <List dense disablePadding>
        {warnings.map((w, i) => (
          <ListItem key={i} disableGutters sx={{ display: 'list-item', ml: 2 }}>
            {t(w.code, w.params ?? {})}
          </ListItem>
        ))}
      </List>
    </Alert>
  )
}
