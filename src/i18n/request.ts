import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { defaultLocale, isLocale, LOCALE_COOKIE } from './locales'
import { withFallback } from './withFallback'
import sv from '../../messages/sv.json'
import en from '../../messages/en.json'

// No locale in the URL: the choice is a cookie, Swedish by default. English
// messages fall back to Swedish key by key.
export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale
  return {
    locale,
    messages: locale === 'sv' ? sv : withFallback(en, sv),
  }
})
