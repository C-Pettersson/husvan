export const locales = ['sv', 'en'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'sv'
export const LOCALE_COOKIE = 'locale'

export function isLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale)
}
