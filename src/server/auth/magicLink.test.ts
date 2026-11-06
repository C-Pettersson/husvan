import { describe, expect, it, vi } from 'vitest'
import { deliverMagicLink, magicLinkMail } from './magicLink'

function prismaWith(allowed: string[], { sentThisHour = 0 } = {}) {
  return {
    allowedEmail: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) =>
        allowed.includes(where.email) ? { blockedAt: null } : null
      ),
    },
    user: {
      findUnique: vi.fn(async () => null),
      count: vi.fn(async () => 0),
    },
    signupSettings: { findUnique: vi.fn(async () => null) },
    loginMail: {
      count: vi.fn(async () => sentThisHour),
      create: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  } as never
}

const link = 'https://husvan.se/api/auth/magic-link/verify?token=abc'
const log = { info: vi.fn() }
const code = '482913'
const createCode = vi.fn(async () => code)

describe('deliverMagicLink', () => {
  it('sends no mail to an address that is not on the allowlist', async () => {
    const mailer = vi.fn()
    const result = await deliverMagicLink(
      { prisma: prismaWith(['owner@example.com']), mailer, createCode, log },
      {
        email: 'someone@else.com',
        url: link,
        locale: 'sv',
        expiresInMinutes: 10,
      }
    )
    expect(result).toBe('not_allowed')
    expect(mailer).not.toHaveBeenCalled()
    expect(createCode).not.toHaveBeenCalled()
  })

  it('sends no mail and issues no code past the limit for a recipient', async () => {
    const mailer = vi.fn()
    const issue = vi.fn(async () => code)
    const result = await deliverMagicLink(
      {
        prisma: prismaWith(['owner@example.com'], { sentThisHour: 5 }),
        mailer,
        createCode: issue,
        log,
      },
      {
        email: 'owner@example.com',
        url: link,
        locale: 'sv',
        expiresInMinutes: 10,
      }
    )
    expect(result).toBe('rate_limited')
    expect(mailer).not.toHaveBeenCalled()
    expect(issue).not.toHaveBeenCalled()
  })

  it('matches the allowlist regardless of case', async () => {
    const mailer = vi.fn()
    const result = await deliverMagicLink(
      { prisma: prismaWith(['owner@example.com']), mailer, createCode, log },
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
        subject: `Verifieringskod till Husvan: ${code}`,
      })
    )
    const message = mailer.mock.calls[0][0]
    expect(message.text).toContain(link)
    expect(message.html).toContain(`href="${link}"`)
    expect(createCode).toHaveBeenCalledWith('Owner@Example.com')
    expect(message.text).toContain(code)
    expect(message.html).toContain(`${code}</strong>`)
  })
})

describe('magicLinkMail', () => {
  it('writes the mail in English when asked', () => {
    const mail = magicLinkMail({
      url: link,
      code,
      locale: 'en',
      expiresInMinutes: 10,
    })
    expect(mail.subject).toBe(`Your Husvan sign-in code is ${code}`)
    expect(mail.text).toContain('10 minutes')
    expect(mail.html).toContain('<html lang="en">')
    expect(mail.html).toContain(
      `<title>Your Husvan sign-in code is ${code}</title>`
    )
    expect(mail.html).toContain('You asked to sign in to husvan.se.')
  })

  // iOS offers the code above the keyboard only if the notification shows it.
  it('opens both parts with the sentence that holds the code', () => {
    const mail = magicLinkMail({
      url: link,
      code,
      locale: 'sv',
      expiresInMinutes: 10,
    })
    expect(mail.text.split('\n')[0]).toBe(mail.subject)
    expect(mail.html).toMatch(
      new RegExp(
        `<body>\\n<p>Verifieringskod till Husvan: <strong [^>]*>${code}</strong></p>`
      )
    )
  })

  it('wraps the html part in a document and keeps the text part plain', () => {
    const mail = magicLinkMail({
      url: link,
      code,
      locale: 'sv',
      expiresInMinutes: 10,
    })
    expect(mail.html).toMatch(/^<!DOCTYPE html>\n<html lang="sv">\n<head>/)
    expect(mail.html).toContain('<meta charset="utf-8">')
    expect(mail.html).toContain(
      `<title>Verifieringskod till Husvan: ${code}</title>`
    )
    expect(mail.html).toContain(
      '</p>\n<p>Du bad om att logga in på husvan.se.</p>\n<p>Skriv koden'
    )
    expect(mail.html).toMatch(/<\/body>\n<\/html>$/)
    expect(mail.text).toBe(
      [
        `Verifieringskod till Husvan: ${code}`,
        '',
        'Skriv koden på inloggningssidan eller öppna länken för att logga in.',
        '',
        link,
        '',
        'Länken och koden gäller i 10 minuter och kan bara användas en gång.',
        'Har du inte bett om att logga in kan du bortse från det här mejlet.',
      ].join('\n')
    )
  })

  it('escapes html in the link', () => {
    const mail = magicLinkMail({
      url: 'https://x.se/?a=1&b="2"',
      code,
      locale: 'sv',
      expiresInMinutes: 5,
    })
    expect(mail.html).toContain('href="https://x.se/?a=1&amp;b=&quot;2&quot;"')
  })
})
