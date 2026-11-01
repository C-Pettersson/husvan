import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import Providers from '@/components/Providers'
import AppHeader from '@/components/AppHeader'
import type { Locale } from '@/i18n/locales'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return {
    title: { default: t('title'), template: `%s | ${t('title')}` },
    description: t('description'),
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = (await getLocale()) as Locale
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          <Providers locale={locale}>
            <AppHeader />
            {children}
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
