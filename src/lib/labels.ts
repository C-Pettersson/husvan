'use client'

import { useLocale, useTranslations } from 'next-intl'
import type { Flag } from '@/server/forecast/flags'
import type { Label } from '@/server/houses/getHouse'
import {
  formatValue,
  keyLabel,
  labelOf,
  type AttributeDefinition,
} from '@/lib/format'

export type TypeLabels = Record<
  string,
  { label: Label; attributeSchema: Record<string, AttributeDefinition> }
>

// Labels for types, attributes, forecast items and flags in the reader's
// language. Keys outside a type's schema take their label from another
// type that defines them, else from the house keys.
export function useLabels(types: TypeLabels) {
  const t = useTranslations()
  const locale = useLocale()
  const anyAttribute: Record<string, AttributeDefinition> = Object.assign(
    {},
    ...Object.values(types).map((x) => x.attributeSchema)
  )
  const typeLabel = (type: string) =>
    labelOf(types[type]?.label, locale) ?? type
  const attribute = (key: string, type?: string) =>
    (type && types[type]?.attributeSchema[key]) || anyAttribute[key]
  const attributeLabel = (key: string, type?: string) =>
    keyLabel(key, { attribute: attribute(key, type), locale, t })
  const valueText = (key: string, value: unknown, type?: string) =>
    formatValue(value, {
      key,
      unit: null,
      attribute: attribute(key, type),
      locale,
      t,
    })

  // "renovation_method=relined" as "Renoveringsmetod: relinad".
  const matchText = (match: Record<string, string>, type?: string) =>
    Object.entries(match)
      .map(([k, v]) => `${attributeLabel(k, type)}: ${valueText(k, v, type)}`)
      .join(', ')

  const flagText = (f: Flag, type?: string) => {
    const p: Record<string, string | number> = { ...f.params }
    // A value read from the house's context, such as its foundation type.
    if (typeof p.key === 'string' && typeof p.value === 'string')
      p.value = valueText(p.key, p.value)
    if (typeof p.key === 'string') p.key = attributeLabel(p.key, type)
    if (typeof p.severity === 'string') p.severity = t(`severity.${p.severity}`)
    if (typeof p.confidence === 'number')
      p.confidence = Math.round(p.confidence * 100)
    if (f.code === 'cheaper_renewal' && typeof p.match === 'string')
      p.match = matchText(
        Object.fromEntries(
          p.match.split(', ').map((pair) => pair.split('=') as [string, string])
        ),
        type
      )
    return t(`flag.${f.code}`, p)
  }

  // A forecast item's name: the part, the work item's description or the
  // running cost.
  const itemLabel = (item: {
    category: string
    key: string
    name?: string
  }) => {
    switch (item.category) {
      case 'replacement':
      case 'repaint':
        return item.name
          ? `${typeLabel(item.key)}: ${item.name}`
          : typeLabel(item.key)
      case 'inspection':
        return `${t('forecastCategory.inspection')}: ${typeLabel(item.key)}`
      case 'work_item':
        return item.name ?? t('forecastCategory.work_item')
      case 'running':
        return t.has(`runningKey.${item.key}`)
          ? t(`runningKey.${item.key}`)
          : keyLabel(item.key, { locale, t })
      default:
        return t('forecastCategory.capital')
    }
  }

  return {
    typeLabel,
    attributeLabel,
    valueText,
    matchText,
    flagText,
    itemLabel,
  }
}
