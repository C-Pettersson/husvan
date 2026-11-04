// Delivers a login mail, or deliberately does nothing. Better Auth calls
// sendMagicLink for any address, so the allowlist check lives here: an unknown
// address gets no mail, no code and no error, and the form shows the same
// neutral message either way.
//
// The mail carries both a link and a six-digit code. The link signs in the
// browser it is opened in; the code lets the mail be read on a phone and the
// sign-in finished on another device, by typing it into the login page there.
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
  code,
  locale,
  expiresInMinutes,
}: {
  url: string
  code: string
  locale: Locale
  expiresInMinutes: number
}) {
  // Same shape as sv in both languages, since en falls back to sv key by key.
  const messages = (locale === 'sv' ? sv : withFallback(en, sv)) as typeof sv
  const t = createTranslator({ locale, messages, namespace: 'mail.magicLink' })
  // The sentence with the code is the subject and the opening line of both
  // parts. iOS can offer a code from a mail app only if it sees it in the
  // notification, which shows little more than the subject and a preview.
  // The wording matters and only a phone can test it: on iOS 26 "Verifieringskod
  // till Husvan: 123456" got a suggestion from the Outlook app, while "Din kod
  // till Husvan är 123456" and "Din inloggningskod till Husvan är 123456" did not.
  const subject = t('subject', { code })
  const text = [
    subject,
    '',
    t('intro'),
    '',
    url,
    '',
    t('expires', { minutes: expiresInMinutes }),
    t('ignore'),
  ].join('\n')
  const codeHtml = `<strong style="font-family:monospace;font-size:28px;letter-spacing:4px">${escapeHtml(code)}</strong>`
  // A complete document: mail clients and spam filters treat a bare fragment
  // as a sign of a careless sender. The context line exists only here.
  const html = htmlDocument({
    lang: locale,
    title: subject,
    body: [
      `<p>${escapeHtml(subject).replace(escapeHtml(code), codeHtml)}</p>`,
      `<p>${escapeHtml(t('context'))}</p>`,
      `<p>${escapeHtml(t('intro'))}</p>`,
      `<p><a href="${escapeAttribute(url)}">${escapeHtml(t('button'))}</a></p>`,
      `<p>${escapeHtml(t('expires', { minutes: expiresInMinutes }))}<br>${escapeHtml(t('ignore'))}</p>`,
    ],
  })
  return { subject, text, html }
}

function htmlDocument({
  lang,
  title,
  body,
}: {
  lang: string
  title: string
  body: string[]
}): string {
  return [
    '<!DOCTYPE html>',
    `<html lang="${escapeAttribute(lang)}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    '</head>',
    '<body>',
    ...body,
    '</body>',
    '</html>',
  ].join('\n')
}

export async function deliverMagicLink(
  {
    prisma,
    mailer,
    createCode,
    log = console,
  }: {
    prisma: Pick<PrismaClient, 'allowedEmail'>
    mailer: Mailer
    // Issues the sign-in code for the address. Called only after the
    // allowlist check, so no code exists for an address that may not sign in.
    createCode: (email: string) => Promise<string>
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
  const code = await createCode(email)
  const mail = magicLinkMail({ url, code, locale, expiresInMinutes })
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
