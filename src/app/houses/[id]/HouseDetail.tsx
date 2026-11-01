'use client'

import { useLocale, useTranslations } from 'next-intl'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Link,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { trpc } from '@/lib/trpc'
import type { ComponentView } from '@/server/houses/getHouse'
import DraftBanner from './DraftBanner'
import ValueTable, { type DocumentRef } from './ValueTable'
import { formatSek, labelOf, type AttributeDefinition } from './format'

const CATEGORY_ORDER = [
  'envelope',
  'heating',
  'ventilation',
  'plumbing',
  'electrical',
  'interior',
  'feature',
]

type Types = Record<
  string,
  {
    label: { sv: string; en?: string }
    category: string
    attributeSchema: Record<string, AttributeDefinition>
  }
>

export default function HouseDetail({
  id,
  draftId,
}: {
  id: string
  draftId?: string
}) {
  const t = useTranslations()
  const locale = useLocale()
  const house = trpc.house.get.useQuery({ id, draftId })

  if (house.isPending) return <CircularProgress />
  if (house.isError) {
    return (
      <Alert severity="error">
        {house.error.data?.code === 'NOT_FOUND'
          ? t('houseDetail.notFound')
          : t('error.generic')}
      </Alert>
    )
  }

  const h = house.data
  const types = h.types as Types
  const documents: Record<string, DocumentRef> = Object.fromEntries(
    h.documents.map((d) => [d.id, d])
  )
  // Keys may lie outside a type's schema (CLAUDE.md, "Typbibliotek som
  // växer"); such a key takes its label from another type that defines it.
  const anyAttribute = Object.assign(
    {},
    ...Object.values(types).map((t) => t.attributeSchema)
  ) as Record<string, AttributeDefinition>
  const attributesOf = (type: string) => ({
    ...anyAttribute,
    ...types[type]?.attributeSchema,
  })
  const typeLabel = (type: string) =>
    labelOf(types[type]?.label, locale) ?? type
  const componentLabel = (c: ComponentView) =>
    c.name ? `${typeLabel(c.type)}: ${c.name}` : typeLabel(c.type)

  const flat = new Map<string, ComponentView>()
  const walk = (cs: ComponentView[]) =>
    cs.forEach((c) => {
      flat.set(c.id, c)
      walk(c.children)
    })
  walk(h.components)

  const categories = [
    ...new Set([
      ...CATEGORY_ORDER,
      ...h.components.map((c) => types[c.type]?.category ?? 'other'),
    ]),
  ]
    .map((category) => ({
      category,
      components: h.components.filter(
        (c) => (types[c.type]?.category ?? 'other') === category
      ),
    }))
    .filter((g) => g.components.length > 0)

  const renderComponent = (c: ComponentView, depth = 0) => (
    <Box
      key={c.id}
      sx={
        depth > 0
          ? { ml: 2, mt: 2, pl: 2, borderLeft: 2, borderColor: 'divider' }
          : undefined
      }
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          {typeLabel(c.type)}
        </Typography>
        {c.draft && (
          <Chip size="small" color="warning" label={t('houseDetail.draft')} />
        )}
      </Stack>
      {c.name && (
        <Typography variant="body2" color="text.secondary">
          {c.name}
        </Typography>
      )}
      {c.values.length > 0 ? (
        <ValueTable
          values={c.values}
          attributes={attributesOf(c.type)}
          documents={documents}
        />
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {t('houseDetail.noValues')}
        </Typography>
      )}
      {c.children.map((child) => renderComponent(child, depth + 1))}
    </Box>
  )

  const nothing =
    h.values.length === 0 &&
    h.components.length === 0 &&
    h.workItems.length === 0

  return (
    <>
      <Button href="/houses" size="small" sx={{ mb: 2 }}>
        {t('houseDetail.back')}
      </Button>
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
      >
        <Typography component="h1" variant="h4">
          {h.address}
        </Typography>
        <Chip label={t(`house.status.${h.status.toLowerCase()}`)} />
      </Stack>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
        {[
          h.propertyDesignation &&
            `${t('houseDetail.propertyDesignation')} ${h.propertyDesignation}`,
          h.municipality &&
            t('houseDetail.municipality', { name: h.municipality.name }),
        ]
          .filter(Boolean)
          .join(' · ')}
      </Typography>

      <DraftBanner houseId={h.id} drafts={h.drafts} preview={h.preview} />

      {nothing && (
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {t('houseDetail.nothingApproved')}
        </Typography>
      )}

      {h.values.length > 0 && (
        <Section title={t('houseDetail.about')}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <ValueTable values={h.values} documents={documents} />
          </Paper>
        </Section>
      )}

      {categories.length > 0 && (
        <Section title={t('houseDetail.components')}>
          <Stack spacing={3}>
            {categories.map((g) => (
              <Box key={g.category}>
                <Typography
                  variant="overline"
                  color="text.secondary"
                  component="h3"
                >
                  {t.has(`category.${g.category}`)
                    ? t(`category.${g.category}`)
                    : g.category}
                </Typography>
                <Stack spacing={2}>
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
      )}

      {h.workItems.length > 0 && (
        <Section title={t('houseDetail.workItems')}>
          <Stack spacing={2}>
            {h.workItems.map((w) => {
              const component = w.componentId ? flat.get(w.componentId) : null
              return (
                <Paper
                  key={w.id}
                  variant="outlined"
                  sx={{
                    p: 2,
                    ...(w.draft && {
                      borderLeft: 3,
                      borderLeftColor: 'warning.main',
                    }),
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    flexWrap="wrap"
                    useFlexGap
                    sx={{ mb: 1 }}
                  >
                    <Chip
                      size="small"
                      variant="outlined"
                      label={t(`workItemKind.${w.kind.toLowerCase()}`)}
                    />
                    <Typography variant="body2" color="text.secondary">
                      {component
                        ? componentLabel(component)
                        : t('houseDetail.wholeHouse')}
                    </Typography>
                    {w.draft && (
                      <Chip
                        size="small"
                        color="warning"
                        label={t('houseDetail.draft')}
                      />
                    )}
                  </Stack>
                  <Typography variant="body2">{w.description}</Typography>
                  {w.quote && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      component="div"
                      sx={{ fontStyle: 'italic', mt: 0.5 }}
                    >
                      ”{w.quote}”
                    </Typography>
                  )}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    component="div"
                  >
                    {[
                      w.documentId && documents[w.documentId]
                        ? t(
                            `documentType.${documents[w.documentId].type.toLowerCase()}`
                          )
                        : null,
                      w.yearMin !== null
                        ? w.yearMax !== null && w.yearMax !== w.yearMin
                          ? `${w.yearMin}–${w.yearMax}`
                          : String(w.yearMin)
                        : t('houseDetail.noYear'),
                      w.costLowSek !== null
                        ? w.costHighSek !== null &&
                          w.costHighSek !== w.costLowSek
                          ? `${formatSek(w.costLowSek, locale)}–${formatSek(w.costHighSek, locale)}`
                          : formatSek(w.costLowSek, locale)
                        : t('houseDetail.noCost'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Typography>
                </Paper>
              )
            })}
          </Stack>
        </Section>
      )}

      <Section title={t('houseDetail.documents')}>
        {h.documents.length === 0 ? (
          <Typography color="text.secondary">
            {t('houseDetail.noDocuments')}
          </Typography>
        ) : (
          <Paper variant="outlined">
            <List disablePadding>
              {h.documents.map((d) => (
                <ListItem key={d.id} divider>
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
      </Section>
    </>
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
    <Box component="section" sx={{ mb: 5 }}>
      <Typography component="h2" variant="h5" sx={{ mb: 2 }}>
        {title}
      </Typography>
      {children}
    </Box>
  )
}
