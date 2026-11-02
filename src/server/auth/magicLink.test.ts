import { describe, expect, it, vi } from 'vitest'
import { deliverMagicLink, magicLinkMail } from './magicLink'

function prismaWith(allowed: string[]) {
  return {
    allowedEmail: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) =>
        allowed.includes(where.email) ? { email: where.email } : null
      ),
    },
  } as never
}

const link = 'https://husvan.se/api/auth/magic-link/verify?token=abc'
const log = { info: vi.fn() }

describe('deliverMagicLink', () => {
  it('sends no mail to an address that is not on the allowlist', async () => {
    const mailer = vi.fn()
    const result = await deliverMagicLink(
      { prisma: prismaWith(['owner@example.com']), mailer, log },
      {
        email: 'someone@else.com',
        url: link,
        locale: 'sv',
        expiresInMinutes: 10,
      }
    )
    expect(result).toBe('not_allowed')
    expect(mailer).not.toHaveBeenCalled()
  })

  it('matches the allowlist regardless of case', async () => {
    const mailer = vi.fn()
    const result = await deliverMagicLink(
      { prisma: prismaWith(['owner@example.com']), mailer, log },
      {
        email: 'Owner@Example.com',
        url: link,
        locale: 'sv',
        expiresInMinutes: 10,
      }
    )
    expect(result).toBe('sent')
    expect(mailer).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'Owner@Example.com',
        subject: 'Logga in på Husvan',
      })
    )
    const message = mailer.mock.calls[0][0]
    expect(message.text).toContain(link)
    expect(message.html).toContain(`href="${link}"`)
  })
})

describe('magicLinkMail', () => {
  it('writes the mail in English when asked', () => {
    const mail = magicLinkMail({
      url: link,
      locale: 'en',
      expiresInMinutes: 10,
    })
    expect(mail.subject).toBe('Sign in to Husvan')
    expect(mail.text).toContain('10 minutes')
    expect(mail.html).toContain('<html lang="en">')
    expect(mail.html).toContain('<title>Sign in to Husvan</title>')
    expect(mail.html).toContain('You asked for a login link to husvan.se.')
  })

  it('wraps the html part in a document and keeps the text part plain', () => {
    const mail = magicLinkMail({
      url: link,
      locale: 'sv',
      expiresInMinutes: 10,
    })
    expect(mail.html).toMatch(/^<!DOCTYPE html>\n<html lang="sv">\n<head>/)
    expect(mail.html).toContain('<meta charset="utf-8">')
    expect(mail.html).toContain('<title>Logga in på Husvan</title>')
    expect(mail.html).toContain(
      '<body>\n<p>Du bad om en inloggningslänk till husvan.se.</p>\n<p>Klicka på länken'
    )
    expect(mail.html).toMatch(/<\/body>\n<\/html>$/)
    expect(mail.text).toBe(
      [
        'Klicka på länken för att logga in på Husvan.',
        '',
        link,
        '',
        'Länken gäller i 10 minuter och kan bara användas en gång.',
        'Har du inte bett om länken kan du bortse från det här mejlet.',
      ].join('\n')
    )
  })

  it('escapes html in the link', () => {
    const mail = magicLinkMail({
      url: 'https://x.se/?a=1&b="2"',
      locale: 'sv',
      expiresInMinutes: 5,
    })
    expect(mail.html).toContain('href="https://x.se/?a=1&amp;b=&quot;2&quot;"')
  })
})
