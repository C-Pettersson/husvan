import { describe, expect, it, vi } from 'vitest'
import {
  createMailer,
  createSmtpMailer,
  mailConfigFromEnv,
  mailOptions,
  smtpTransportOptions,
} from './sendMail'

const config = {
  host: 'smtp.mx.cloudflare.net',
  port: 465,
  user: 'api_token',
  token: 'secret-token',
  from: 'noreply@husvan.se',
}

describe('mailConfigFromEnv', () => {
  it('fills in Cloudflare defaults around the token', () => {
    expect(mailConfigFromEnv({ SMTP_TOKEN: ' tok ' })).toEqual({
      host: 'smtp.mx.cloudflare.net',
      port: 465,
      user: 'api_token',
      token: 'tok',
      from: 'noreply@husvan.se',
    })
  })

  it('takes the explicit values when set', () => {
    expect(
      mailConfigFromEnv({
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '587',
        SMTP_USER: 'u',
        SMTP_TOKEN: 'tok',
        MAIL_FROM: 'login@example.com',
      })
    ).toEqual({
      host: 'smtp.example.com',
      port: 587,
      user: 'u',
      token: 'tok',
      from: 'login@example.com',
    })
  })

  it('is unconfigured without a token and refuses a bad port', () => {
    expect(mailConfigFromEnv({ SMTP_HOST: 'x' })).toBeNull()
    expect(() =>
      mailConfigFromEnv({ SMTP_TOKEN: 't', SMTP_PORT: 'abc' })
    ).toThrow(/SMTP_PORT/)
  })
})

describe('smtpTransportOptions', () => {
  it('uses implicit TLS on 465 with the token as password', () => {
    expect(smtpTransportOptions(config)).toMatchObject({
      host: 'smtp.mx.cloudflare.net',
      port: 465,
      secure: true,
      requireTLS: false,
      auth: { user: 'api_token', pass: 'secret-token' },
    })
  })

  it('requires STARTTLS on any other port', () => {
    expect(smtpTransportOptions({ ...config, port: 587 })).toMatchObject({
      secure: false,
      requireTLS: true,
    })
  })
})

describe('mailOptions', () => {
  it('builds the message from the configured sender', () => {
    expect(
      mailOptions(config, {
        to: 'owner@example.com',
        subject: 'Logga in',
        text: 'https://husvan.se/api/auth/magic-link/verify?token=abc',
        html: '<a href="x">x</a>',
      })
    ).toEqual({
      from: 'noreply@husvan.se',
      to: 'owner@example.com',
      subject: 'Logga in',
      text: 'https://husvan.se/api/auth/magic-link/verify?token=abc',
      html: '<a href="x">x</a>',
    })
  })

  it('leaves html out when there is none', () => {
    expect(
      mailOptions(config, { to: 'a@b.se', subject: 's', text: 't' })
    ).not.toHaveProperty('html')
  })
})

describe('createSmtpMailer', () => {
  it('hands the message to the transport', async () => {
    const transport = { sendMail: vi.fn().mockResolvedValue({}) }
    const send = createSmtpMailer(config, transport)
    await send({ to: 'a@b.se', subject: 's', text: 't' })
    expect(transport.sendMail).toHaveBeenCalledWith({
      from: 'noreply@husvan.se',
      to: 'a@b.se',
      subject: 's',
      text: 't',
    })
  })

  it('passes a transport failure on', async () => {
    const transport = {
      sendMail: vi.fn().mockRejectedValue(new Error('535 auth failed')),
    }
    const send = createSmtpMailer(config, transport)
    await expect(
      send({ to: 'a@b.se', subject: 's', text: 't' })
    ).rejects.toThrow(/535/)
  })
})

describe('createMailer', () => {
  it('builds the transport from the environment', async () => {
    const transport = { sendMail: vi.fn().mockResolvedValue({}) }
    const transportFor = vi.fn(() => transport)
    const send = createMailer({ SMTP_TOKEN: 'tok' }, transportFor)
    await send({ to: 'a@b.se', subject: 's', text: 't' })
    expect(transportFor).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.mx.cloudflare.net', token: 'tok' })
    )
    expect(transport.sendMail).toHaveBeenCalledTimes(1)
  })

  it('refuses to send in production without a token', async () => {
    const send = createMailer({ NODE_ENV: 'production' })
    await expect(
      send({ to: 'a@b.se', subject: 's', text: 't' })
    ).rejects.toThrow(/not configured/)
  })

  it('logs instead of sending in development without a token', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const transportFor = vi.fn()
    const send = createMailer({ NODE_ENV: 'development' }, transportFor)
    await send({ to: 'a@b.se', subject: 's', text: 'link' })
    expect(transportFor).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('link'))
    log.mockRestore()
  })
})
