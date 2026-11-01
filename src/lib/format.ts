import type { useTranslations } from 'next-intl'
import type { Label } from '@/server/houses/getHouse'

type T = ReturnType<typeof useTranslations>

export type AttributeDefinition = {
  label: Label
  datatype: string
  unit?: string
  options?: Record<string, Label>
}

// Labels for data that grows during operation: en falls back to sv.
export function labelOf(label: Label | undefined, locale: string) {
  if (!label) return undefined
  return locale === 'en' ? (label.en ?? label.sv) : label.sv
}

const UNITS: Record<string, string> = {
  m2: 'm²',
  'kWh/m2': 'kWh/m²',
  'Bq/m3': 'Bq/m³',
}

export function numberFormat(locale: string) {
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'sv-SE')
}

export function formatSek(value: number, locale: string) {
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(value)
}

// House keys are not in the type library, so their kind follows the naming
// conventions in CLAUDE.md: *_year is a year, *_sek* an amount.
function houseKeyDatatype(key: string) {
  if (key.endsWith('_year') && !key.endsWith('_per_year')) return 'year'
  return undefined
}

export function formatValue(
  value: unknown,
  {
    key,
    unit,
    attribute,
    locale,
    t,
  }: {
    key: string
    unit: string | null
    attribute?: AttributeDefinition
    locale: string
    t: T
  }
): string {
  if (Array.isArray(value))
    return value
      .map((v) => formatValue(v, { key, unit, attribute, locale, t }))
      .join(', ')
  if (typeof value === 'boolean') return t(value ? 'value.yes' : 'value.no')
  const datatype = attribute?.datatype ?? houseKeyDatatype(key)
  if (typeof value === 'number') {
    if (datatype === 'year') return String(value)
    if (key.includes('_sek')) return formatSek(value, locale)
    const u = unit ?? attribute?.unit
    const n = numberFormat(locale).format(value)
    return u ? `${n} ${UNITS[u] ?? u}` : n
  }
  if (typeof value === 'string') {
    const option = attribute?.options?.[value]
    if (option) return labelOf(option, locale)!
    const message = `house.value.${key}.${value}`
    return t.has(message) ? t(message) : value
  }
  return JSON.stringify(value)
}

export function keyLabel(
  key: string,
  {
    attribute,
    locale,
    t,
  }: { attribute?: AttributeDefinition; locale: string; t: T }
) {
  if (attribute) return labelOf(attribute.label, locale)!
  return t.has(`house.key.${key}`) ? t(`house.key.${key}`) : key
}

export type Range = { low: number; typical: number; high: number }

// Large amounts in lists and tiles: "1,79 mn kr".
export function formatSekShort(value: number, locale: string) {
  if (Math.abs(value) < 100_000) return formatSek(value, locale)
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'sv-SE', {
    style: 'currency',
    currency: 'SEK',
    notation: 'compact',
    maximumSignificantDigits: 3,
  }).format(value)
}

export function formatSekRange(r: Range, locale: string) {
  return `${formatSekShort(r.low, locale)}–${formatSekShort(r.high, locale)}`
}

export function formatShare(value: number, locale: string) {
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'sv-SE', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value)
}

// An area statistic in its unit.
export function formatStatistic(value: number, unit: string, locale: string) {
  if (unit === 'share') return formatShare(value, locale)
  if (unit === 'SEK') return formatSek(value, locale)
  return numberFormat(locale).format(Math.round(value * 10) / 10)
}
