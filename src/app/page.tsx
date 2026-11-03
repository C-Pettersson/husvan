import { headers } from 'next/headers'
import { getFormatter, getTranslations } from 'next-intl/server'
import { Box, Button, Container, Paper, Stack, Typography } from '@mui/material'
import { auth } from '@/lib/auth'
import { LogoMark } from '@/components/Logo'

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

// The year wheel for the house in the conversation above, once bought:
// Boden, built 1978, concrete roof tiles from the build year and a remark on
// damp in the crawl space. Months are 0-based. The crawl space check comes
// twice because the remark shortens its interval to six months.
const WHEEL_YEAR = 2027
const WHEEL = [
  { month: 0, key: 'snow', source: 'routine' },
  { month: 0, key: 'radon', source: 'routine' },
  { month: 1, key: 'bathroom', source: 'routine' },
  { month: 2, key: 'earthFault', source: 'routine' },
  { month: 2, key: 'garageDoor', source: 'own' },
  { month: 3, key: 'meltwater', source: 'inspection' },
  { month: 4, key: 'crawlSpace', source: 'routine' },
  { month: 5, key: 'facade', source: 'routine' },
  { month: 6, key: 'crawlSpaceFix', source: 'inspection' },
  { month: 7, key: 'roof', source: 'project' },
  { month: 7, key: 'heatPump', source: 'routine' },
  { month: 8, key: 'gutters', source: 'routine' },
  { month: 9, key: 'outdoorTaps', source: 'routine' },
  { month: 10, key: 'crawlSpace', source: 'routine' },
  { month: 11, key: 'smokeAlarms', source: 'routine' },
] as const
// Colours follow the cost chart where the meaning is the same: work items
// from the inspection and replacements from the forecast.
const WHEEL_SOURCES = {
  routine: '#2f5d50',
  inspection: '#eda100',
  project: '#eb6834',
  own: '#6b6a66',
} as const
// A scheduled task in the user's Claude that runs every morning, so Claude
// speaks first.
const REMINDER = [
  { key: 'due', from: 'ai', note: true },
  { key: 'yes', from: 'you' },
  { key: 'planned', from: 'ai', note: true },
  { key: 'log', from: 'you', files: true },
  { key: 'remark', from: 'ai', note: true },
] as const
const CHECK_LOOK_FOR = ['moisture', 'smell', 'stains'] as const
const WHEEL_POINTS = ['local', 'calendar', 'history'] as const

// The public start page. Everything else requires sign-in.
export default async function HomePage() {
  const t = await getTranslations('home')
  const format = await getFormatter()
  const session = await auth.api.getSession({ headers: await headers() })

  return (
    <>
      <Container maxWidth="md" sx={{ py: { xs: 6, md: 10 } }}>
        <Stack
          spacing={3}
          alignItems="flex-start"
          sx={{ mb: { xs: 6, md: 9 } }}
        >
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
                  files={
                    'files' in m ? t(`chat.messages.${m.key}.files`) : null
                  }
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
          <Typography variant="body1" sx={{ mb: 2.5 }}>
            {t('laterBody')}
          </Typography>

          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, mb: 2 }}>
            <Typography variant="overline" color="text.secondary" component="p">
              {t('wheel.label', { year: WHEEL_YEAR })}
            </Typography>
            <Stack
              direction="row"
              flexWrap="wrap"
              columnGap={2}
              rowGap={0.5}
              sx={{ mb: 2 }}
            >
              {Object.entries(WHEEL_SOURCES).map(([source, color]) => (
                <Stack
                  key={source}
                  direction="row"
                  spacing={0.75}
                  alignItems="center"
                >
                  <Dot color={color} />
                  <Typography variant="caption" color="text.secondary">
                    {t(`wheel.sources.${source}`)}
                  </Typography>
                </Stack>
              ))}
            </Stack>
            <Box
              component="ol"
              sx={{
                listStyle: 'none',
                p: 0,
                m: 0,
                display: 'grid',
                gap: 1,
                gridTemplateColumns: {
                  xs: '1fr 1fr',
                  sm: 'repeat(3, 1fr)',
                  md: 'repeat(4, 1fr)',
                },
              }}
            >
              {Array.from({ length: 12 }, (_, month) => (
                <Box
                  key={month}
                  component="li"
                  sx={{ bgcolor: 'grey.100', borderRadius: 1, p: 1.25 }}
                >
                  <Typography
                    variant="caption"
                    fontWeight={600}
                    component="p"
                    sx={{ mb: 0.5, textTransform: 'capitalize' }}
                  >
                    {format.dateTime(
                      new Date(Date.UTC(WHEEL_YEAR, month, 15)),
                      {
                        month: 'long',
                        timeZone: 'UTC',
                      }
                    )}
                  </Typography>
                  <Stack
                    component="ul"
                    spacing={0.5}
                    sx={{ listStyle: 'none', p: 0, m: 0 }}
                  >
                    {WHEEL.filter((w) => w.month === month).map((w) => (
                      <Stack
                        key={w.key}
                        component="li"
                        direction="row"
                        spacing={0.75}
                        alignItems="baseline"
                      >
                        <Dot color={WHEEL_SOURCES[w.source]} />
                        <Typography variant="caption" sx={{ lineHeight: 1.35 }}>
                          {t(`wheel.items.${w.key}`)}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              ))}
            </Box>
            <Typography
              variant="caption"
              component="p"
              sx={{ mt: 1.5, color: 'secondary.main' }}
            >
              {t('wheel.question')}
            </Typography>
          </Paper>

          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              alignItems: 'start',
              mb: 3,
            }}
          >
            <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography
                variant="overline"
                color="text.secondary"
                component="p"
              >
                {t('check.label')}
              </Typography>
              <Typography variant="subtitle1" fontWeight={600}>
                {t('check.title')}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 1.5 }}
              >
                {t('check.meta')}
              </Typography>
              <Box
                sx={{
                  borderLeft: 3,
                  borderColor: WHEEL_SOURCES.inspection,
                  pl: 1.5,
                  mb: 1.5,
                }}
              >
                <Typography variant="body2">{t('check.why')}</Typography>
              </Box>
              <Typography variant="body2" fontWeight={600}>
                {t('check.lookFor')}
              </Typography>
              <Stack
                component="ul"
                spacing={0.5}
                sx={{ pl: 2.5, mt: 0.5, mb: 1.5 }}
              >
                {CHECK_LOOK_FOR.map((l) => (
                  <Typography key={l} component="li" variant="body2">
                    {t(`check.items.${l}`)}
                  </Typography>
                ))}
              </Stack>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {t('check.result')}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                component="p"
              >
                {t('check.notInspection')}
              </Typography>
            </Paper>

            <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography
                variant="overline"
                color="text.secondary"
                component="p"
                sx={{ mb: 1.5 }}
              >
                {t('reminder.label')}
              </Typography>
              <Stack spacing={1.5}>
                {REMINDER.map((m) => (
                  <ChatMessage
                    key={m.key}
                    from={m.from}
                    speaker={t(`chat.${m.from}`)}
                    text={t(`reminder.messages.${m.key}.text`)}
                    files={
                      'files' in m
                        ? t(`reminder.messages.${m.key}.files`)
                        : null
                    }
                    note={
                      'note' in m
                        ? `${t('chat.husvan')}: ${t(`reminder.messages.${m.key}.note`)}`
                        : null
                    }
                  />
                ))}
              </Stack>
            </Paper>
          </Box>

          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
            }}
          >
            {WHEEL_POINTS.map((p) => (
              <Box key={p}>
                <Typography variant="subtitle1" fontWeight={600}>
                  {t(`wheelPoints.${p}.title`)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t(`wheelPoints.${p}.body`)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Section>
      </Container>

      <Box
        component="footer"
        sx={{
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Container
          maxWidth="md"
          sx={{
            py: 3,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1.5,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <LogoMark sx={{ fontSize: 20 }} />
            <Typography variant="body2" color="text.secondary">
              © {new Date().getFullYear()} Husvan
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {t('invite')}
          </Typography>
        </Container>
      </Box>
    </>
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

function Dot({ color }: { color: string }) {
  return (
    <Box
      aria-hidden
      sx={{
        flex: '0 0 auto',
        width: 8,
        height: 8,
        borderRadius: '50%',
        bgcolor: color,
      }}
    />
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
