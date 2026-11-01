'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import EditOutlined from '@mui/icons-material/EditOutlined'
import { trpc } from '@/lib/trpc'
import type { ComponentView } from '@/server/houses/getHouse'
import type { HouseKey } from '@/server/library/houseKeys'
import {
  formatSek,
  keyLabel,
  labelOf,
  type AttributeDefinition,
} from '@/lib/format'
import AssumptionsSection from './AssumptionsSection'
import CostSection from './CostSection'
import DocumentsSection from './DocumentsSection'
import DraftBanner from './DraftBanner'
import {
  EditValueDialog,
  RetractDialog,
  useKinds,
  type ValueKind,
} from './EditValue'
import { CoreDialog, WorkItemDialog } from './EditHouse'
import { AreaSection, FactsSection } from './FactsSection'
import ValueTable, { type DocumentRef } from './ValueTable'

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

type AddValue = {
  componentId?: string
  title: string
  keys: { key: string; label: string; kind: ValueKind }[]
}

export default function HouseDetail({
  id,
  draftId,
}: {
  id: string
  draftId?: string
}) {
  const t = useTranslations()
  const locale = useLocale()
  const kinds = useKinds()
  const house = trpc.house.get.useQuery({ id, draftId })
  const [editCore, setEditCore] = useState(false)
  const [adding, setAdding] = useState<AddValue | null>(null)
  const [workItem, setWorkItem] = useState<{
    item?: (typeof h.workItems)[number]
  } | null>(null)
  const [dismissing, setDismissing] = useState<string | null>(null)

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
  const houseKeys = h.houseKeys as Record<string, HouseKey>
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

  const houseKind = (key: string): ValueKind =>
    houseKeys[key]
      ? kinds.fromHouseKey(key, houseKeys[key])
      : { datatype: 'text' }
  const componentKind = (type: string) => (key: string) => {
    const def = attributesOf(type)[key]
    return def ? kinds.fromAttribute(def) : { datatype: 'text' }
  }

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
        {!c.draft && (
          <Button
            size="small"
            sx={{ ml: 'auto !important' }}
            onClick={() =>
              setAdding({
                componentId: c.id,
                title: `${t('edit.addTitle')}: ${componentLabel(c)}`,
                keys: Object.entries(types[c.type]?.attributeSchema ?? {}).map(
                  ([key, def]) => ({
                    key,
                    label: keyLabel(key, { attribute: def, locale, t }),
                    kind: kinds.fromAttribute(def),
                  })
                ),
              })
            }
          >
            {t('edit.add')}
          </Button>
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
          edit={{
            houseId: h.id,
            componentId: c.id,
            kindOf: componentKind(c.type),
          }}
        />
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {t('houseDetail.noValues')}
        </Typography>
      )}
      {c.children.map((child) => renderComponent(child, depth + 1))}
    </Box>
  )

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
        <Button size="small" onClick={() => setEditCore(true)}>
          {t('core.edit')}
        </Button>
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

      <Section title={t('cost.title')}>
        <CostSection houseId={h.id} />
      </Section>

      <Section title={t('facts.title')}>
        <FactsSection
          houseId={h.id}
          componentName={(cid) => {
            const c = flat.get(cid)
            return c && componentLabel(c)
          }}
        />
      </Section>

      <Section
        title={t('houseDetail.about')}
        action={
          <Button
            size="small"
            onClick={() =>
              setAdding({
                title: t('edit.addTitle'),
                keys: Object.keys(houseKeys).map((key) => ({
                  key,
                  label: keyLabel(key, { locale, t }),
                  kind: houseKind(key),
                })),
              })
            }
          >
            {t('edit.add')}
          </Button>
        }
      >
        {h.values.length > 0 ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <ValueTable
              values={h.values}
              documents={documents}
              edit={{ houseId: h.id, kindOf: houseKind }}
            />
          </Paper>
        ) : (
          <Typography color="text.secondary">
            {t('houseDetail.nothingApproved')}
          </Typography>
        )}
      </Section>

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

      <Section
        title={t('houseDetail.workItems')}
        action={
          <Button size="small" onClick={() => setWorkItem({})}>
            {t('workItemEdit.add')}
          </Button>
        }
      >
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
                  {w.severity && (
                    <Chip
                      size="small"
                      variant="outlined"
                      color={
                        w.severity === 'SEVERE'
                          ? 'error'
                          : w.severity === 'MINOR'
                            ? 'default'
                            : 'warning'
                      }
                      label={t(`severity.${w.severity}`)}
                    />
                  )}
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
                  {!w.draft && (
                    <Box sx={{ ml: 'auto !important', whiteSpace: 'nowrap' }}>
                      <IconButton
                        size="small"
                        aria-label={t('workItemEdit.editLabel', {
                          description: w.description,
                        })}
                        onClick={() => setWorkItem({ item: w })}
                      >
                        <EditOutlined fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label={t('workItemEdit.dismissLabel', {
                          description: w.description,
                        })}
                        onClick={() => setDismissing(w.id)}
                      >
                        <DeleteOutline fontSize="small" />
                      </IconButton>
                    </Box>
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
                      ? w.costHighSek !== null && w.costHighSek !== w.costLowSek
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

      <Section title={t('houseDetail.documents')}>
        <DocumentsSection houseId={h.id} documents={h.documents} />
      </Section>

      <Section title={t('area.title')}>
        <AreaSection houseId={h.id} />
      </Section>

      <Section title={t('assumptions.title')}>
        <AssumptionsSection houseId={h.id} />
      </Section>

      {editCore && <CoreDialog house={h} onClose={() => setEditCore(false)} />}
      {adding && (
        <EditValueDialog
          target={{ houseId: h.id, componentId: adding.componentId }}
          title={adding.title}
          keys={adding.keys}
          onClose={() => setAdding(null)}
        />
      )}
      {workItem && (
        <WorkItemDialog
          houseId={h.id}
          item={workItem.item}
          components={[...flat.values()]
            .filter((c) => !c.draft)
            .map((c) => ({ id: c.id, label: componentLabel(c) }))}
          onClose={() => setWorkItem(null)}
        />
      )}
      {dismissing && (
        <RetractDialog
          houseId={h.id}
          workItemId={dismissing}
          title={t('workItemEdit.dismissTitle')}
          body={t('workItemEdit.dismissBody')}
          confirm={t('workItemEdit.dismiss')}
          onClose={() => setDismissing(null)}
        />
      )}
    </>
  )
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Box component="section" sx={{ mb: 5 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Typography component="h2" variant="h5">
          {title}
        </Typography>
        {action}
      </Stack>
      {children}
    </Box>
  )
}
