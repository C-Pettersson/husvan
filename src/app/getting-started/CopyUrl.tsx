'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Box, Button, Stack } from '@mui/material'

export default function CopyUrl({ url }: { url: string }) {
  const t = useTranslations('gettingStarted')
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setState('copied')
    } catch {
      // The browser refused. The address is on screen and can be selected.
      setState('failed')
    }
  }

  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={1}
      alignItems={{ xs: 'stretch', sm: 'center' }}
      sx={{ mt: 1.5 }}
    >
      <Box
        component="code"
        sx={{
          flexGrow: 1,
          px: 1.5,
          py: 0.75,
          borderRadius: 1,
          bgcolor: 'grey.100',
          fontFamily: 'monospace',
          fontSize: '0.875rem',
          overflowWrap: 'anywhere',
        }}
      >
        {url}
      </Box>
      <Button
        onClick={copy}
        variant="outlined"
        size="small"
        aria-live="polite"
        sx={{ flexShrink: 0 }}
      >
        {t(
          state === 'copied'
            ? 'copied'
            : state === 'failed'
              ? 'copyFailed'
              : 'copy'
        )}
      </Button>
    </Stack>
  )
}
