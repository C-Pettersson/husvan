'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Alert } from '@mui/material'
import type { LibraryUpdates } from '@/server/houses/libraryUpdates'

// Types added to the library since the house was last read: the documents
// may mention such parts, and Claude can re-read them. The web only says so.
export default function LibraryUpdatesNote({
  updates,
}: {
  updates: LibraryUpdates | null
}) {
  const t = useTranslations('houseDetail')
  const locale = useLocale()
  if (!updates || !updates.types.length) return null
  const label = (l: { sv: string; en?: string }) =>
    (locale === 'en' && l.en) || l.sv
  return (
    <Alert severity="info" sx={{ mb: 3 }}>
      {t('libraryUpdates', {
        count: updates.types.length,
        date: new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'sv-SE', {
          dateStyle: 'medium',
        }).format(updates.readAt.at),
        types: updates.types.map((u) => label(u.label)).join(', '),
      })}{' '}
      {t('libraryUpdatesHint')}
    </Alert>
  )
}
