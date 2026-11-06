import type { Metadata } from 'next'
import { getFormatter, getTranslations } from 'next-intl/server'
import {
  Box,
  Button,
  Chip,
  Container,
  Link,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { LogoMark } from '@/components/Logo'
import prisma from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { getSiteUrl } from '@/lib/siteUrl'
import { signupState } from '@/server/users/signup'

// The differences in the example conversation, in kronor. Only the difference
// is drawn: the conversation never states the prices themselves.
const PRICE_GAP = 400_000
const ADJUSTED_GAP = 120_000
// Each house keeps its colour across both rows.
const HOUSE_COLORS = { a: 'secondary.main', b: 'primary.main' } as const

// An example conversation. The AI does the reading and the judging; the note
// beside each answer says what Husvan stored or calculated for it.
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
// Colours follow the cost chart on the house page where the meaning is the
// same: work items from the inspection and replacements from the forecast.
// The shape tells the sources apart without relying on colour.
const WHEEL_SOURCES = {
  routine: { color: 'primary.main', shape: 'circle' },
  inspection: { color: '#eda100', shape: 'diamond' },
  project: { color: '#eb6834', shape: 'square' },
  own: { color: '#6b6a66', shape: 'ring' },
} as const

const SITE_NAME = 'Husvan'
const PAGE_WIDTH = 1080
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
} as const
const BOLD = { b: (chunks: React.ReactNode) => <b>{chunks}</b> }

// The title is absolute: the layout's template does not apply to a page in the
// layout's own segment, and this one already carries the name.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('home.meta')
  const title = t('title')
  const description = t('description')
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      url: '/',
      siteName: SITE_NAME,
      title,
      description,
    },
  }
}

// The public start page. Everything else requires sign-in.
export default async function HomePage() {
  const t = await getTranslations('home')
  const format = await getFormatter()
  const session = await getSession()
  const signup = session ? null : (await signupState(prisma)).status

  const cta = {
    href: session ? '/houses' : '/login',
    label: session ? t('open') : t('signIn'),
    access:
      signup === null
        ? null
        : signup === 'open'
          ? t('accessOpen')
          : signup === 'paused'
            ? t('accessPaused')
            : t('access'),
  }

  return (
    <>
      {/* Tells Google which name to show for the site in search results. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: SITE_NAME,
            url: `${getSiteUrl()}/`,
          }).replace(/</g, '\\u003c'),
        }}
      />
      <Box component="main" sx={{ '& p': { textWrap: 'pretty' } }}>
        <PageContainer sx={{ py: { xs: 5, md: 10 } }}>
          <Box
            sx={{
              display: 'grid',
              gap: { xs: 5, md: 8 },
              gridTemplateColumns: {
                xs: 'minmax(0, 1fr)',
                md: 'minmax(0, 1.1fr) minmax(0, 1fr)',
              },
              alignItems: 'center',
            }}
          >
            <Box>
              <Typography
                component="h1"
                sx={{
                  fontSize: { xs: '2.5rem', md: '3.75rem' },
                  fontWeight: 700,
                  lineHeight: 1.05,
                  letterSpacing: '-0.02em',
                  textWrap: 'balance',
                  mb: 3,
                }}
              >
                {t('title')}
              </Typography>
              <Typography
                component="p"
                color="text.secondary"
                sx={{
                  fontSize: { xs: '1.0625rem', md: '1.1875rem' },
                  lineHeight: 1.5,
                  maxWidth: '36em',
                  mb: 4,
                }}
              >
                {t('lead')}
              </Typography>
              <Cta {...cta} />
            </Box>

            <Paper
              component="figure"
              variant="outlined"
              sx={{ m: 0, p: { xs: 2.5, md: 3.5 } }}
            >
              <Typography
                component="figcaption"
                variant="body2"
                fontWeight={600}
                sx={{ mb: 2.5 }}
              >
                {t('hero.label')}
              </Typography>
              <Box
                aria-hidden
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  columnGap: 2,
                }}
              >
                <HouseName
                  name={t('hero.houseA')}
                  color={HOUSE_COLORS.a}
                  align="left"
                />
                <HouseName
                  name={t('hero.houseB')}
                  color={HOUSE_COLORS.b}
                  align="right"
                />
              </Box>
              <GapRow
                label={t('hero.price')}
                house="b"
                amount={t('hero.amount', { amount: PRICE_GAP })}
                share={1}
                summary={t('hero.summary', {
                  measure: t('hero.price'),
                  house: t('hero.houseB'),
                  amount: PRICE_GAP,
                })}
              />
              <GapRow
                label={t('adjusted.title')}
                house="a"
                amount={t('hero.amount', { amount: ADJUSTED_GAP })}
                share={ADJUSTED_GAP / PRICE_GAP}
                summary={t('hero.summary', {
                  measure: t('adjusted.title'),
                  house: t('hero.houseA'),
                  amount: ADJUSTED_GAP,
                })}
              />
              <Typography variant="body2" sx={{ mt: 3 }}>
                {t('hero.takeaway')}
              </Typography>
            </Paper>
          </Box>
        </PageContainer>

        <Section
          title={t('flow')}
          lead={t('flowLead')}
          sx={{
            bgcolor: 'background.paper',
            borderTop: 1,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography
            component="p"
            variant="body2"
            color="text.secondary"
            sx={{ mb: 2 }}
          >
            {t('chat.label')}
          </Typography>
          <Stack spacing={2.5}>
            {CHAT.map((m) => (
              <ChatMessage
                key={m.key}
                from={m.from}
                speaker={t(`chat.${m.from}`)}
                text={t.rich(`chat.messages.${m.key}.text`, BOLD)}
                files={'files' in m ? t(`chat.messages.${m.key}.files`) : null}
                note={'note' in m ? t(`chat.messages.${m.key}.note`) : null}
                noteLabel={t('chat.husvan')}
              />
            ))}
          </Stack>
        </Section>

        <Section title={t('how')}>
          <Box
            component="ol"
            sx={{
              listStyle: 'none',
              p: 0,
              m: 0,
              display: 'grid',
              columnGap: 4,
              rowGap: 4,
              gridTemplateColumns: {
                xs: 'minmax(0, 1fr)',
                sm: 'repeat(2, minmax(0, 1fr))',
                md: 'repeat(4, minmax(0, 1fr))',
              },
            }}
          >
            {STEPS.map((step, i) => (
              <Box
                key={step}
                component="li"
                sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}
              >
                <Typography
                  aria-hidden
                  component="p"
                  color="primary"
                  sx={{ fontSize: '1.5rem', fontWeight: 700, mb: 1 }}
                >
                  {i + 1}
                </Typography>
                <Typography
                  component="h3"
                  variant="subtitle1"
                  fontWeight={600}
                  sx={{ mb: 0.5 }}
                >
                  {t(`steps.${step}.title`)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t(`steps.${step}.body`)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Section>

        <Section title={t('measures')} sx={{ pt: { xs: 0, md: 0 } }}>
          {MEASURES.map((m) => (
            <Box
              key={m}
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: 'minmax(0, 1fr)',
                  md: '320px minmax(0, 1fr)',
                },
                columnGap: 4,
                rowGap: 0.5,
                borderTop: 1,
                borderColor: 'divider',
                py: 2.5,
              }}
            >
              <Typography
                component="h3"
                sx={{ fontSize: '1.125rem', fontWeight: 600 }}
              >
                {t(`${m}.title`)}
              </Typography>
              <Typography color="text.secondary" sx={{ maxWidth: '62ch' }}>
                {t(`${m}.body`)}
              </Typography>
            </Box>
          ))}
        </Section>

        <Section title={t('principles')} sx={{ pt: { xs: 0, md: 0 } }}>
          <Box
            sx={{
              display: 'grid',
              columnGap: 6,
              rowGap: 4,
              gridTemplateColumns: {
                xs: 'minmax(0, 1fr)',
                md: 'repeat(2, minmax(0, 1fr))',
              },
            }}
          >
            {PRINCIPLES.map((p) => (
              <Box key={p}>
                <Typography
                  component="h3"
                  sx={{
                    fontSize: { xs: '1.25rem', md: '1.5rem' },
                    fontWeight: 700,
                    lineHeight: 1.2,
                    letterSpacing: '-0.01em',
                    textWrap: 'balance',
                    mb: 1,
                  }}
                >
                  {t(`principle.${p}.title`)}
                </Typography>
                <Typography color="text.secondary" sx={{ maxWidth: '52ch' }}>
                  {t(`principle.${p}.body`)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Section>

        <Section
          title={t('later')}
          status={t('laterStatus')}
          lead={t('laterBody')}
          sx={{
            bgcolor: 'background.paper',
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Typography
            component="p"
            variant="body2"
            fontWeight={600}
            sx={{ mb: 1 }}
          >
            {t('wheel.label', { year: WHEEL_YEAR })}
          </Typography>
          <Stack
            direction="row"
            flexWrap="wrap"
            columnGap={2.5}
            rowGap={0.5}
            sx={{ mb: 2 }}
          >
            {(Object.keys(WHEEL_SOURCES) as (keyof typeof WHEEL_SOURCES)[]).map(
              (source) => (
                <Stack
                  key={source}
                  direction="row"
                  spacing={0.75}
                  alignItems="center"
                >
                  <SourceMark source={source} />
                  <Typography variant="body2" color="text.secondary">
                    {t(`wheel.sources.${source}`)}
                  </Typography>
                </Stack>
              )
            )}
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
                xs: 'repeat(2, minmax(0, 1fr))',
                sm: 'repeat(3, minmax(0, 1fr))',
                md: 'repeat(4, minmax(0, 1fr))',
              },
            }}
          >
            {Array.from({ length: 12 }, (_, month) => (
              <Box
                key={month}
                component="li"
                sx={{ bgcolor: 'background.default', borderRadius: 1, p: 1.5 }}
              >
                <Typography
                  variant="body2"
                  fontWeight={600}
                  component="p"
                  sx={{ mb: 0.75, textTransform: 'capitalize' }}
                >
                  {format.dateTime(new Date(Date.UTC(WHEEL_YEAR, month, 15)), {
                    month: 'long',
                    timeZone: 'UTC',
                  })}
                </Typography>
                <Stack
                  component="ul"
                  spacing={0.75}
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
                      <SourceMark source={w.source} />
                      <Typography
                        component="span"
                        sx={{ fontSize: '0.8125rem', lineHeight: 1.35 }}
                      >
                        <Box component="span" sx={VISUALLY_HIDDEN}>
                          {t(`wheel.sources.${w.source}`)}:{' '}
                        </Box>
                        {t(`wheel.items.${w.key}`)}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            ))}
          </Box>
        </Section>

        <Section title={t('about.title')}>
          <Stack spacing={2} sx={{ maxWidth: '65ch' }}>
            <Typography>{t('about.origin')}</Typography>
            <Typography>{t('about.ambition')}</Typography>
            <Typography>
              {t.rich('about.brf', {
                link: (chunks) => (
                  <Link
                    href="https://brfjamforelse.se/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </Typography>
          </Stack>
        </Section>

        <Box
          component="section"
          sx={{
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            py: { xs: 6, md: 9 },
          }}
        >
          <PageContainer>
            <Typography
              component="h2"
              sx={{
                fontSize: { xs: '1.75rem', md: '2.5rem' },
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                textWrap: 'balance',
                maxWidth: '20em',
                mb: 2,
              }}
            >
              {t('closing.title')}
            </Typography>
            <Typography sx={{ maxWidth: '36em', mb: 4 }}>
              {t('closing.body')}
            </Typography>
            <Cta {...cta} inverted />
          </PageContainer>
        </Box>
      </Box>

      <Box component="footer" sx={{ bgcolor: 'background.paper' }}>
        <PageContainer sx={{ py: 3 }}>
          <Stack
            direction="row"
            flexWrap="wrap"
            useFlexGap
            spacing={1}
            alignItems="center"
          >
            <LogoMark sx={{ fontSize: 20 }} />
            <Typography variant="body2" color="text.secondary">
              © {new Date().getFullYear()} Husvan
            </Typography>
            <Link href="/privacy" variant="body2" sx={{ pl: 1 }}>
              {t('footerPrivacy')}
            </Link>
            <Link href="/tools" variant="body2" sx={{ pl: 1 }}>
              {t('footerTools')}
            </Link>
          </Stack>
        </PageContainer>
      </Box>
    </>
  )
}

function PageContainer({
  children,
  sx,
}: {
  children: React.ReactNode
  sx?: Record<string, unknown>
}) {
  return (
    <Container maxWidth={false} sx={{ maxWidth: PAGE_WIDTH, ...sx }}>
      {children}
    </Container>
  )
}

function Cta({
  href,
  label,
  access,
  inverted = false,
}: {
  href: string
  label: string
  access: string | null
  inverted?: boolean
}) {
  return (
    <Stack spacing={1.25} alignItems="flex-start">
      <Button
        href={href}
        variant="contained"
        size="large"
        disableElevation
        sx={{
          minHeight: 48,
          px: 3,
          fontSize: '1rem',
          fontWeight: 600,
          textTransform: 'none',
          '&.Mui-focusVisible': {
            outline: '2px solid',
            outlineColor: inverted ? 'common.white' : 'primary.main',
            outlineOffset: 2,
          },
          ...(inverted && {
            bgcolor: 'common.white',
            color: 'primary.main',
            '&:hover': { bgcolor: 'background.default' },
          }),
        }}
      >
        {label}
      </Button>
      {access && (
        <Typography
          variant="body2"
          color={inverted ? 'inherit' : 'text.secondary'}
        >
          {access}
        </Typography>
      )}
    </Stack>
  )
}

function HouseName({
  name,
  color,
  align,
}: {
  name: string
  color: string
  align: 'left' | 'right'
}) {
  return (
    <Stack
      direction={align === 'left' ? 'row' : 'row-reverse'}
      spacing={0.75}
      alignItems="center"
    >
      <Box
        sx={{
          flex: '0 0 auto',
          width: 10,
          height: 10,
          borderRadius: '2px',
          bgcolor: color,
        }}
      />
      <Typography variant="body2" fontWeight={600}>
        {name}
      </Typography>
    </Stack>
  )
}

// One row of the comparison: which house costs more, and by how much. The
// bar grows out from the shared centre line, on the side of the dearer house.
function GapRow({
  label,
  house,
  amount,
  share,
  summary,
}: {
  label: string
  house: 'a' | 'b'
  amount: string
  share: number
  summary: string
}) {
  const left = house === 'a'
  return (
    <Box role="img" aria-label={summary} sx={{ mt: 2.5 }}>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ textAlign: 'center', mb: 0.75 }}
      >
        {label}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <Box
          sx={{
            borderRight: 1,
            borderColor: 'text.secondary',
            minHeight: 52,
          }}
        >
          {left && <GapBar amount={amount} share={share} side="left" />}
        </Box>
        <Box>
          {!left && <GapBar amount={amount} share={share} side="right" />}
        </Box>
      </Box>
    </Box>
  )
}

function GapBar({
  amount,
  share,
  side,
}: {
  amount: string
  share: number
  side: 'left' | 'right'
}) {
  const left = side === 'left'
  return (
    <Box sx={{ textAlign: left ? 'right' : 'left' }}>
      <Typography
        component="span"
        sx={{
          display: 'block',
          fontSize: { xs: '1.25rem', md: '1.75rem' },
          fontWeight: 700,
          lineHeight: 1.15,
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
          px: 1,
          mb: 0.5,
        }}
      >
        {amount}
      </Typography>
      <Box
        sx={{
          height: 10,
          width: `${share * 100}%`,
          ml: left ? 'auto' : 0,
          bgcolor: left ? HOUSE_COLORS.a : HOUSE_COLORS.b,
          borderRadius: left ? '4px 0 0 4px' : '0 4px 4px 0',
        }}
      />
    </Box>
  )
}

function ChatMessage({
  from,
  speaker,
  text,
  files,
  note,
  noteLabel,
}: {
  from: 'you' | 'ai'
  speaker: string
  text: React.ReactNode
  files: string | null
  note: string | null
  noteLabel: string
}) {
  const you = from === 'you'
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr)',
          md: 'minmax(0, 1fr) 280px',
        },
        columnGap: 4,
        rowGap: 1,
      }}
    >
      <Box
        sx={{
          justifySelf: you ? 'end' : 'start',
          maxWidth: { xs: '92%', md: 580 },
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
              : { bgcolor: 'background.default', borderBottomLeftRadius: 4 }),
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
          <Typography sx={{ fontSize: '0.9375rem', lineHeight: 1.5 }}>
            {text}
          </Typography>
        </Box>
      </Box>
      {note && (
        <Typography
          component="p"
          variant="body2"
          sx={{
            color: 'secondary.dark',
            alignSelf: 'start',
            mt: { md: 3 },
            pl: { md: 2 },
            borderLeft: { md: 1 },
            borderColor: { md: 'divider' },
          }}
        >
          <Box component="b" sx={{ display: 'block', fontWeight: 700 }}>
            {noteLabel}
          </Box>
          {note}
        </Typography>
      )}
    </Box>
  )
}

function SourceMark({ source }: { source: keyof typeof WHEEL_SOURCES }) {
  const { color, shape } = WHEEL_SOURCES[source]
  return (
    <Box
      aria-hidden
      sx={{
        flex: '0 0 auto',
        width: 9,
        height: 9,
        ...(shape === 'ring'
          ? { border: '2px solid', borderColor: color, borderRadius: '50%' }
          : { bgcolor: color }),
        ...(shape === 'circle' && { borderRadius: '50%' }),
        ...(shape === 'diamond' && { transform: 'rotate(45deg)' }),
      }}
    />
  )
}

function Section({
  title,
  status,
  lead,
  children,
  sx,
}: {
  title: string
  status?: string
  lead?: string
  children: React.ReactNode
  sx?: Record<string, unknown>
}) {
  return (
    <Box component="section" sx={{ py: { xs: 6, md: 9 }, ...sx }}>
      <PageContainer>
        <Stack
          direction="row"
          flexWrap="wrap"
          alignItems="center"
          columnGap={2}
          rowGap={1}
          sx={{ mb: lead ? 2 : 4 }}
        >
          <Typography
            component="h2"
            sx={{
              fontSize: { xs: '1.625rem', md: '2.125rem' },
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: '-0.01em',
              textWrap: 'balance',
            }}
          >
            {title}
          </Typography>
          {status && <Chip label={status} variant="outlined" size="small" />}
        </Stack>
        {lead && (
          <Typography sx={{ maxWidth: '65ch', mb: 4 }}>{lead}</Typography>
        )}
        {children}
      </PageContainer>
    </Box>
  )
}
