'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Alert, Box, Stack, Typography } from '@mui/material'
import type { ComponentView, RetirementView } from '@/server/houses/getHouse'
import { formatValue, type AttributeDefinition } from '@/lib/format'

// What a previewed draft corrects (CLAUDE.md, "Rättningar"), shown as
// before and after: parts moved, renamed or retyped, and values retired.
// Nothing here changes until the draft is approved.
export default function CorrectionsPanel({
  components,
  retirements,
  typeLabel,
  attributesOf,
  keyLabel,
}: {
  components: ComponentView[]
  retirements: RetirementView[]
  typeLabel: (type: string) => string
  attributesOf: (type: string) => Record<string, AttributeDefinition>
  keyLabel: (key: string, type: string | null) => string
}) {
  const t = useTranslations('houseDetail')
  const tAll = useTranslations()
  const locale = useLocale()

  // Every part by id, with the part it sits under now.
  const flat = new Map<
    string,
    { c: ComponentView; parent: ComponentView | null }
  >()
  const walk = (list: ComponentView[], parent: ComponentView | null) =>
    list.forEach((c) => {
      flat.set(c.id, { c, parent })
      walk(c.children, c)
    })
  walk(components, null)
  const corrected = [...flat.values()].filter(({ c }) => c.draft && c.corrects)
  if (!corrected.length && !retirements.length) return null

  const describe = (
    type: string,
    name: string | null,
    parentId: string | null
  ) => {
    const parent = parentId ? flat.get(parentId)?.c : undefined
    const where = parentId
      ? t('correctionUnder', {
          parent: parent
            ? `${typeLabel(parent.type)}${parent.name ? `: ${parent.name}` : ''}`
            : parentId,
        })
      : t('correctionTop')
    return `${typeLabel(type)}${name ? `: ${name}` : ''} (${where})`
  }

  return (
    <Alert severity="info" sx={{ mb: 3 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {t('corrections')}
      </Typography>
      <Stack spacing={1}>
        {corrected.map(({ c, parent }) => (
          <Box key={c.id}>
            <Typography variant="body2">
              <strong>{t('correctionBefore')}:</strong>{' '}
              {describe(
                c.corrects!.type,
                c.corrects!.name,
                c.corrects!.parentId
              )}
            </Typography>
            <Typography variant="body2">
              <strong>{t('correctionAfter')}:</strong>{' '}
              {describe(c.type, c.name, parent?.id ?? null)}
            </Typography>
          </Box>
        ))}
        {retirements.map((r) => {
          const owner = r.componentId ? flat.get(r.componentId)?.c : undefined
          const type = owner?.type ?? null
          const def = type ? attributesOf(type)[r.key] : undefined
          return (
            <Typography key={r.id} variant="body2">
              <strong>{t('retirement')}:</strong>{' '}
              {owner
                ? `${typeLabel(owner.type)}${owner.name ? `: ${owner.name}` : ''} · `
                : ''}
              {keyLabel(r.key, type)} ={' '}
              {formatValue(r.value, {
                key: r.key,
                unit: r.unit,
                attribute: def,
                locale,
                t: tAll,
              })}
              {r.reason ? ` (${r.reason})` : ''}
            </Typography>
          )
        })}
      </Stack>
    </Alert>
  )
}
