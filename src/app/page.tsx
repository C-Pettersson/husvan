import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { Box, Button, Container, Paper, Stack, Typography } from '@mui/material'
import { auth } from '@/lib/auth'

// An example conversation. The AI does the reading and the judging; the note
// under each answer says what Husvan stored or calculated for it.
const CHAT = [
  { key: 'upload', from: 'you', files: true },
  { key: 'draft', from: 'ai', note: true },
  { key: 'approve', from: 'you' },
  { key: 'approved', from: 'ai', note: true },
  { key: 'cost', from: 'you' },
  { key: 'forecast', from: 'ai', note: true },
  { key: 'compare', from: 'you' },
  { key: 'comparison', from: 'ai', note: true },
] as const
const STEPS = ['connect', 'upload', 'approve', 'compare'] as const
const MEASURES = ['debt', 'adjusted', 'forecast'] as const
const PRINCIPLES = ['unknown', 'disclosure', 'sources', 'model'] as const

// The public start page. Everything else requires sign-in.
export default async function HomePage() {
  const t = await getTranslations('home')
  const session = await auth.api.getSession({ headers: await headers() })

  return (
    <Container maxWidth="md" sx={{ py: { xs: 6, md: 10 } }}>
      <Stack spacing={3} alignItems="flex-start" sx={{ mb: { xs: 6, md: 9 } }}>
        <Typography
          component="h1"
          variant="h3"
          fontWeight={700}
          sx={{ fontSize: { xs: '2.1rem', md: '3rem' } }}
        >
          {t('title')}
        </Typography>
        <Typography variant="h6" color="text.secondary" fontWeight={400}>
          {t('lead')}
        </Typography>
        <Button
          href={session ? '/houses' : '/login'}
          variant="contained"
          size="large"
        >
          {session ? t('open') : t('signIn')}
        </Button>
      </Stack>

      <Section title={t('split')}>
        <Typography variant="body1" sx={{ mb: 2.5 }}>
          {t('splitLead')}
        </Typography>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography
            variant="overline"
            color="text.secondary"
            component="p"
            sx={{ mb: 1.5 }}
          >
            {t('chat.label')}
          </Typography>
          <Stack spacing={1.5}>
            {CHAT.map((m) => (
              <ChatMessage
                key={m.key}
                from={m.from}
                speaker={t(`chat.${m.from}`)}
                text={t(`chat.messages.${m.key}.text`)}
                files={'files' in m ? t(`chat.messages.${m.key}.files`) : null}
                note={
                  'note' in m
                    ? `${t('chat.husvan')}: ${t(`chat.messages.${m.key}.note`)}`
                    : null
                }
              />
            ))}
          </Stack>
        </Paper>
      </Section>

      <Section title={t('how')}>
        <Box
          component="ol"
          sx={{
            listStyle: 'none',
            p: 0,
            m: 0,
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            counterReset: 'step',
          }}
        >
          {STEPS.map((step, i) => (
            <Paper
              key={step}
              component="li"
              variant="outlined"
              sx={{ p: 2.5, display: 'flex', gap: 2 }}
            >
              <Box
                aria-hidden
                sx={{
                  flex: '0 0 auto',
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                }}
              >
                {i + 1}
              </Box>
              <Box>
                <Typography variant="subtitle1" fontWeight={600}>
                  {t(`steps.${step}.title`)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t(`steps.${step}.body`)}
                </Typography>
              </Box>
            </Paper>
          ))}
        </Box>
      </Section>

      <Section title={t('measures')}>
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          }}
        >
          {MEASURES.map((m) => (
            <Box key={m}>
              <Typography variant="subtitle1" fontWeight={600}>
                {t(`${m}.title`)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t(`${m}.body`)}
              </Typography>
            </Box>
          ))}
        </Box>
      </Section>

      <Section title={t('principles')}>
        <Stack component="ul" spacing={1.5} sx={{ pl: 2.5, m: 0 }}>
          {PRINCIPLES.map((p) => (
            <Typography key={p} component="li" variant="body1">
              {t(`principle.${p}`)}
            </Typography>
          ))}
        </Stack>
      </Section>

      <Section title={t('later')}>
        <Typography variant="body1">{t('laterBody')}</Typography>
      </Section>

      <Typography variant="body2" color="text.secondary">
        {t('personal')}
      </Typography>
    </Container>
  )
}

function ChatMessage({
  from,
  speaker,
  text,
  files,
  note,
}: {
  from: 'you' | 'ai'
  speaker: string
  text: string
  files: string | null
  note: string | null
}) {
  const you = from === 'you'
  return (
    <Box
      sx={{
        alignSelf: you ? 'flex-end' : 'flex-start',
        maxWidth: { xs: '92%', sm: '80%' },
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        component="p"
        sx={{ mb: 0.5, textAlign: you ? 'right' : 'left' }}
      >
        {speaker}
      </Typography>
      <Box
        sx={{
          px: 2,
          py: 1.25,
          borderRadius: 2,
          ...(you
            ? {
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                borderBottomRightRadius: 4,
              }
            : { bgcolor: 'grey.100', borderBottomLeftRadius: 4 }),
        }}
      >
        {files && (
          <Typography
            variant="caption"
            component="p"
            sx={{ mb: 0.5, opacity: 0.85 }}
          >
            {files}
          </Typography>
        )}
        <Typography variant="body2">{text}</Typography>
      </Box>
      {note && (
        <Typography
          variant="caption"
          component="p"
          sx={{ mt: 0.5, color: 'secondary.main' }}
        >
          {note}
        </Typography>
      )}
    </Box>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Box component="section" sx={{ mb: { xs: 5, md: 7 } }}>
      <Typography component="h2" variant="h5" fontWeight={600} sx={{ mb: 2 }}>
        {title}
      </Typography>
      {children}
    </Box>
  )
}
