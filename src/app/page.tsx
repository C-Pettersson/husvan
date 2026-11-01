import { getTranslations } from 'next-intl/server'
import { Button, Container, Stack, Typography } from '@mui/material'

// The public start page. Everything else requires sign-in.
export default async function HomePage() {
  const t = await getTranslations('home')
  return (
    <Container maxWidth="md" sx={{ py: 10 }}>
      <Stack spacing={3} alignItems="flex-start">
        <Typography component="h1" variant="h3" fontWeight={700}>
          {t('title')}
        </Typography>
        <Typography variant="h6" color="text.secondary" fontWeight={400}>
          {t('lead')}
        </Typography>
        <Button href="/houses" variant="contained">
          {t('open')}
        </Button>
      </Stack>
    </Container>
  )
}
