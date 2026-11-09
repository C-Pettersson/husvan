import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import {
  Box,
  Button,
  Chip,
  Container,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { componentTypes } from '../../../prisma/data/componentTypes.mts'
import {
  formatSek,
  formatSekRange,
  formatShare,
  labelOf,
  numberFormat,
  type AttributeDefinition,
} from '@/lib/format'
import type { Label } from '@/server/houses/getHouse'
import ValueTable, { type DocumentRef } from '../houses/[id]/ValueTable'
import {
  DEMO_ACTORS,
  DEMO_ASSUMPTIONS,
  DEMO_COMPONENTS,
  DEMO_CORE,
  DEMO_DOCUMENTS,
  DEMO_FORECASTS,
  DEMO_LOG,
  DEMO_REPLACED,
  DEMO_VALUES,
  DEMO_WORK_ITEMS,
  type DemoComponent,
} from './demoHouse'

const CATEGORY_ORDER = [
  'envelope',
  'heating',
  'ventilation',
  'plumbing',
  'electrical',
  'interior',
  'feature',
  'site',
]

const TYPES = new Map(
  componentTypes.map((t) => [
    t.type,
    {
      label: t.label as Label,
      category: t.category,
      attributes: (t.attributeSchema ?? {}) as Record<
        string,
        AttributeDefinition
      >,
    },
  ])
)

const flatten = (cs: DemoComponent[]): DemoComponent[] =>
  cs.flatMap((c) => [c, ...flatten(c.children)])
const partTypes = new Map(
  flatten(DEMO_COMPONENTS).map((c) => [c.id, c.type] as const)
)

const DOCUMENT_REFS: Record<string, DocumentRef> = Object.fromEntries(
  DEMO_DOCUMENTS.map((d) => [d.id, { type: d.type, title: d.title }])
)

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('demo')
  return {
    title: t('title'),
    description: t('metaDescription'),
    alternates: { canonical: '/demo' },
  }
}

function Section({
  title,
  body,
  children,
}: {
  title: string
  body: string
  children: ReactNode
}) {
  return (
    <Box component="section">
      <Typography component="h2" variant="h6" gutterBottom>
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2, maxWidth: '65ch' }}>
        {body}
      </Typography>
      {children}
    </Box>
  )
}

// Public, so that someone can see what Husvan keeps about a house before
// connecting Claude. Every value is made up (demoHouse.ts); the tables are
// the ones the real house page uses.
export default async function DemoPage() {
  const t = await getTranslations()
  const locale = await getLocale()
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'sv-SE', {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format(new Date(`${iso}T12:00:00Z`))
  const typeLabel = (type: string) =>
    labelOf(TYPES.get(type)?.label, locale) ?? type
  const docTitle = (id: string) => {
    const d = DEMO_DOCUMENTS.find((x) => x.id === id)!
    return `${t(`documentType.${d.type.toLowerCase()}`)}, ${date(d.date)}`
  }

  const renderComponent = (c: DemoComponent, depth = 0): ReactNode => {
    const replaced = c.replaces
      ? DEMO_REPLACED.find((r) => r.id === c.replaces!.id)
      : undefined
    return (
      <Box
        key={c.id}
        sx={
          depth
            ? {
                mt: 1.5,
                pl: { xs: 1, sm: 2 },
                borderLeft: 2,
                borderColor: 'divider',
              }
            : undefined
        }
      >
        <Stack direction="row" alignItems="center" flexWrap="wrap" gap={1}>
          <Typography component={depth ? 'h4' : 'h3'} variant="subtitle1">
            {typeLabel(c.type)}
          </Typography>
          {c.name && (
            <Typography variant="body2" color="text.secondary">
              {c.name}
            </Typography>
          )}
          <Typography
            component="code"
            variant="caption"
            color="text.secondary"
            sx={{ fontFamily: 'monospace' }}
          >
            {c.type}
          </Typography>
        </Stack>
        <ValueTable
          values={c.values}
          attributes={TYPES.get(c.type)?.attributes}
          documents={DOCUMENT_REFS}
        />
        {replaced && (
          <Box sx={{ mt: 1, opacity: 0.75 }}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              {t('demo.components.replaces', {
                type: typeLabel(replaced.type),
              })}
            </Typography>
            <ValueTable
              values={replaced.values}
              attributes={TYPES.get(replaced.type)?.attributes}
              documents={DOCUMENT_REFS}
            />
          </Box>
        )}
        {c.children.map((child) => renderComponent(child, depth + 1))}
      </Box>
    )
  }

  const categories = CATEGORY_ORDER.map((category) => ({
    category,
    components: DEMO_COMPONENTS.filter(
      (c) => TYPES.get(c.type)?.category === category
    ),
  })).filter((g) => g.components.length)

  const assumptionValue = (key: string, value: string | number) => {
    if (key === 'horizon_years') return t('assumptions.years', { count: value })
    if (key === 'interest_rate') return formatShare(Number(value), locale)
    if (key === 'loan_sek') return formatSek(Number(value), locale)
    if (key === 'operating_cost_trend') return t(`assumptions.trend.${value}`)
    return String(value)
  }

  const statusColor = {
    APPROVED: 'success',
    REJECTED: 'default',
    DRAFT: 'warning',
  } as const

  return (
    <Container maxWidth="md" component="main" sx={{ py: 6 }}>
      <Typography component="h1" variant="h4" gutterBottom>
        {t('demo.title')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2, maxWidth: '65ch' }}>
        {t('demo.lead')}
      </Typography>
      <Chip
        color="info"
        variant="outlined"
        label={t('demo.madeUp')}
        sx={{ mb: 5 }}
      />

      <Stack spacing={6}>
        <Section title={t('demo.core.title')} body={t('demo.core.body')}>
          <Paper variant="outlined">
            <Table size="small">
              <TableBody>
                {(
                  [
                    ['address', DEMO_CORE.address],
                    ['propertyDesignation', DEMO_CORE.propertyDesignation],
                    [
                      'municipality',
                      `${DEMO_CORE.municipality.name} (${DEMO_CORE.municipality.code})`,
                    ],
                    [
                      'status',
                      t(`house.status.${DEMO_CORE.status.toLowerCase()}`),
                    ],
                    ['createdAt', date(DEMO_CORE.createdAt)],
                  ] as const
                ).map(([key, value]) => (
                  <TableRow key={key}>
                    <TableCell
                      component="th"
                      scope="row"
                      sx={{ width: '38%', color: 'text.secondary' }}
                    >
                      {t(`demo.core.${key}`)}
                    </TableCell>
                    <TableCell>{value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Section>

        <Section
          title={t('demo.documents.title')}
          body={t('demo.documents.body')}
        >
          <Stack spacing={1.5}>
            {DEMO_DOCUMENTS.map((d) => (
              <Paper key={d.id} variant="outlined" sx={{ p: 2 }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  flexWrap="wrap"
                  gap={1}
                >
                  <Chip
                    size="small"
                    label={t(`documentType.${d.type.toLowerCase()}`)}
                  />
                  <Typography variant="subtitle2">{d.title}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {date(d.date)}
                  </Typography>
                </Stack>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {[
                    DEMO_ACTORS[d.actor].name,
                    'amountSek' in d ? formatSek(d.amountSek, locale) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="div"
                  sx={{ overflowWrap: 'anywhere' }}
                >
                  {t('demo.documents.file', {
                    filename: d.filename,
                    pages: d.pages,
                    size: numberFormat(locale).format(
                      Math.round(d.sizeBytes / 100_000) / 10
                    ),
                  })}
                  {'sourceUrl' in d && ` · ${d.sourceUrl}`}
                </Typography>
              </Paper>
            ))}
          </Stack>
        </Section>

        <Section title={t('demo.values.title')} body={t('demo.values.body')}>
          <Paper variant="outlined">
            <ValueTable values={DEMO_VALUES} documents={DOCUMENT_REFS} />
          </Paper>
        </Section>

        <Section
          title={t('demo.components.title')}
          body={t('demo.components.body')}
        >
          <Stack spacing={4}>
            {categories.map((g) => (
              <Box key={g.category}>
                <Typography
                  variant="overline"
                  color="text.secondary"
                  component="div"
                >
                  {t(`category.${g.category}`)}
                </Typography>
                <Stack spacing={3}>
                  {g.components.map((c) => (
                    <Paper key={c.id} variant="outlined" sx={{ p: 2 }}>
                      {renderComponent(c)}
                    </Paper>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        </Section>

        <Section
          title={t('demo.workItems.title')}
          body={t('demo.workItems.body')}
        >
          <Stack spacing={1.5}>
            {DEMO_WORK_ITEMS.map((w) => (
              <Paper
                key={w.id}
                variant="outlined"
                sx={{
                  p: 2,
                  // A server component cannot pass a theme callback.
                  ...(w.draft && {
                    borderLeft: 3,
                    borderLeftColor: 'warning.main',
                  }),
                }}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  flexWrap="wrap"
                  gap={1}
                  sx={{ mb: 0.5 }}
                >
                  <Chip
                    size="small"
                    label={t(`workItemKind.${w.kind.toLowerCase()}`)}
                  />
                  {w.severity && (
                    <Chip
                      size="small"
                      variant="outlined"
                      color={
                        w.severity === 'MINOR'
                          ? 'default'
                          : w.severity === 'RISK'
                            ? 'warning'
                            : 'error'
                      }
                      label={t(`severity.${w.severity}`)}
                    />
                  )}
                  {w.draft && (
                    <Chip
                      size="small"
                      color="warning"
                      label={t('houseDetail.draft')}
                    />
                  )}
                  <Typography variant="body2" color="text.secondary">
                    {typeLabel(partTypes.get(w.component) ?? '')}
                  </Typography>
                </Stack>
                <Typography variant="body2" fontWeight={500}>
                  {w.description}
                </Typography>
                <Typography variant="body2">
                  {t('demo.workItems.when', {
                    years:
                      w.yearMin === w.yearMax
                        ? String(w.yearMin)
                        : `${w.yearMin}–${w.yearMax}`,
                    cost: `${numberFormat(locale).format(w.costLowSek)}–${formatSek(w.costHighSek, locale)}`,
                  })}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="div"
                >
                  {[
                    t(`source.${w.source.toLowerCase()}`),
                    w.doc ? docTitle(w.doc) : null,
                    w.confidence !== undefined
                      ? t('houseDetail.confidence', {
                          value: numberFormat(locale).format(
                            Math.round(w.confidence * 100)
                          ),
                        })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography>
                {w.quote && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    component="div"
                    sx={{ fontStyle: 'italic' }}
                  >
                    ”{w.quote}”
                  </Typography>
                )}
              </Paper>
            ))}
          </Stack>
        </Section>

        <Section
          title={t('demo.assumptions.title')}
          body={t('demo.assumptions.body')}
        >
          <Paper variant="outlined">
            <Table size="small">
              <TableBody>
                {DEMO_ASSUMPTIONS.map((a) => (
                  <TableRow key={a.key}>
                    <TableCell
                      component="th"
                      scope="row"
                      sx={{ width: '38%', color: 'text.secondary' }}
                    >
                      {t(`assumptions.key.${a.key}`)}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {assumptionValue(a.key, a.value)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t(`assumptions.source.${a.scope}`)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Section>

        <Section title={t('demo.log.title')} body={t('demo.log.body')}>
          <Paper variant="outlined">
            <Table size="small" sx={{ '& td': { verticalAlign: 'top' } }}>
              <TableBody>
                {DEMO_LOG.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell sx={{ whiteSpace: 'nowrap', width: '1%' }}>
                      <Typography variant="body2">{date(c.at)}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t(`source.${c.source.toLowerCase()}`)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        color={statusColor[c.status]}
                        label={t(`demo.log.status.${c.status.toLowerCase()}`)}
                        sx={{ mb: 0.5 }}
                      />
                      <Typography variant="body2">
                        {t(`demo.log.entries.${c.entry}`)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Section>

        <Section
          title={t('demo.forecasts.title')}
          body={t('demo.forecasts.body')}
        >
          <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('demo.forecasts.when')}</TableCell>
                  <TableCell align="right">
                    {t('demo.forecasts.total')}
                  </TableCell>
                  <TableCell align="right">
                    {t('demo.forecasts.perMonth')}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {DEMO_FORECASTS.map((f) => (
                  <TableRow key={f.at}>
                    <TableCell>
                      <Typography variant="body2">{date(f.at)}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t(`demo.forecasts.entries.${f.entry}`, {
                          years: f.horizonYears,
                        })}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={500}>
                        {formatSek(f.typical, locale)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatSekRange(f, locale)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {formatSek(
                        Math.round(f.typical / (f.horizonYears * 12) / 100) *
                          100,
                        locale
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Section>

        <Box component="section" sx={{ maxWidth: '65ch' }}>
          <Typography sx={{ mb: 2 }}>{t('demo.connect')}</Typography>
          <Stack
            direction="row"
            flexWrap="wrap"
            useFlexGap
            spacing={2}
            alignItems="center"
          >
            <Button
              href="/getting-started"
              variant="contained"
              disableElevation
            >
              {t('tools.getStarted')}
            </Button>
            <Link href="/tools">{t('demo.tools')}</Link>
            <Link href="/privacy">{t('tools.privacy')}</Link>
          </Stack>
        </Box>
      </Stack>
    </Container>
  )
}
