// Delivers a login link, or deliberately does nothing. Better Auth calls
// sendMagicLink for any address, so the allowlist check lives here: an unknown
// address gets no mail and no error, and the form shows the same neutral
// message either way.
import { createTranslator } from 'next-intl'
import type { PrismaClient } from '@prisma/client'
import { defaultLocale, isLocale, type Locale } from '@/i18n/locales'
import { withFallback } from '@/i18n/withFallback'
import sv from '../../../messages/sv.json'
import en from '../../../messages/en.json'
import type { Mailer } from '@/server/mail/sendMail'
import { isEmailAllowed } from '@/server/users/allowlist'

export function resolveLocale(value: string | undefined): Locale {
  return isLocale(value) ? value : defaultLocale
}

export function magicLinkMail({
  url,
  locale,
  expiresInMinutes,
}: {
  url: string
  locale: Locale
  expiresInMinutes: number
}) {
  // Same shape as sv in both languages, since en falls back to sv key by key.
  const messages = (locale === 'sv' ? sv : withFallback(en, sv)) as typeof sv
  const t = createTranslator({ locale, messages, namespace: 'mail.magicLink' })
  const subject = t('subject')
  const text = [
    t('intro'),
    '',
    url,
    '',
    t('expires', { minutes: expiresInMinutes }),
    t('ignore'),
  ].join('\n')
  const html = [
    `<p>${escapeHtml(t('intro'))}</p>`,
    `<p><a href="${escapeAttribute(url)}">${escapeHtml(t('button'))}</a></p>`,
    `<p>${escapeHtml(t('expires', { minutes: expiresInMinutes }))}<br>${escapeHtml(t('ignore'))}</p>`,
  ].join('\n')
  return { subject, text, html }
}

export async function deliverMagicLink(
  {
    prisma,
    mailer,
    log = console,
  }: {
    prisma: Pick<PrismaClient, 'allowedEmail'>
    mailer: Mailer
    log?: Pick<Console, 'info'>
  },
  {
    email,
    url,
    locale,
    expiresInMinutes,
  }: { email: string; url: string; locale: Locale; expiresInMinutes: number }
): Promise<'sent' | 'not_allowed'> {
  if (!(await isEmailAllowed(prisma, email))) {
    log.info(`[auth] login link requested for an address not on the allowlist`)
    return 'not_allowed'
  }
  const mail = magicLinkMail({ url, locale, expiresInMinutes })
  await mailer({ to: email, ...mail })
  return 'sent'
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;')
}
