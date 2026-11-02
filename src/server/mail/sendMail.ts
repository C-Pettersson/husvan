// Outgoing mail over SMTP through Cloudflare Email Service's relay. The only
// mail the app sends is the login link, so this is one transport and one
// message shape: nodemailer for the protocol, nothing on top.
//
// Configuration (see .env.example): SMTP_HOST (smtp.mx.cloudflare.net),
// SMTP_PORT (465, implicit TLS), SMTP_TOKEN (an API token with the Email
// Sending permission, used as the password for the user "api_token") and
// MAIL_FROM (an address on a domain enabled for sending in Cloudflare, bare
// or with a display name: "Husvan <noreply@husvan.se>").
import nodemailer from 'nodemailer'

export type MailMessage = {
  to: string
  subject: string
  text: string
  html?: string
}

// The sender as nodemailer takes it: kept apart so the display name is
// encoded by the library rather than pasted into a header.
export type MailAddress = {
  name?: string
  address: string
}

export type MailConfig = {
  host: string
  port: number
  user: string
  token: string
  from: MailAddress
}

export type Mailer = (message: MailMessage) => Promise<void>

export type Env = Record<string, string | undefined>

const DEFAULTS = {
  host: 'smtp.mx.cloudflare.net',
  port: 465,
  user: 'api_token',
  from: 'Husvan <noreply@husvan.se>',
}

// Accepts "address" or "Name <address>". Quotes around the name are dropped,
// since nodemailer adds its own when the name needs them. Anything else, a
// bare name or a missing @ among them, is a misconfiguration worth failing on
// at startup rather than at the first login.
export function parseMailAddress(value: string): MailAddress {
  const trimmed = value.trim()
  const withName = /^(.*?)\s*<([^<>\s]+@[^<>\s]+)>$/.exec(trimmed)
  if (withName) {
    const name = withName[1].replace(/^"(.*)"$/, '$1').trim()
    return name ? { name, address: withName[2] } : { address: withName[2] }
  }
  if (/^[^<>\s]+@[^<>\s]+$/.test(trimmed)) return { address: trimmed }
  throw new Error(
    `MAIL_FROM is not an address or "Name <address>": ${JSON.stringify(value)}`
  )
}

export function mailConfigFromEnv(env: Env = process.env): MailConfig | null {
  const token = env.SMTP_TOKEN?.trim()
  if (!token) return null
  const port = Number(env.SMTP_PORT?.trim() || DEFAULTS.port)
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`SMTP_PORT is not a port number: ${env.SMTP_PORT}`)
  }
  return {
    host: env.SMTP_HOST?.trim() || DEFAULTS.host,
    port,
    user: env.SMTP_USER?.trim() || DEFAULTS.user,
    token,
    from: parseMailAddress(env.MAIL_FROM?.trim() || DEFAULTS.from),
  }
}

// Port 465 is SMTPS (TLS from the first byte); anything else starts in
// plain text and must upgrade with STARTTLS before the token is sent.
export function smtpTransportOptions(config: MailConfig) {
  return {
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: { user: config.user, pass: config.token },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  }
}

export function mailOptions(config: MailConfig, message: MailMessage) {
  return {
    from: config.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.html && { html: message.html }),
  }
}

export type Transport = {
  sendMail: (options: ReturnType<typeof mailOptions>) => Promise<unknown>
}

export function createSmtpMailer(
  config: MailConfig,
  transport: Transport = nodemailer.createTransport(
    smtpTransportOptions(config)
  )
): Mailer {
  return async (message) => {
    await transport.sendMail(mailOptions(config, message))
  }
}

// Without a token, production refuses to send (a login link in a log is a
// credential), while development prints the mail so the link can be opened
// from the terminal.
export function createMailer(
  env: Env = process.env,
  transportFor: (config: MailConfig) => Transport = (config) =>
    nodemailer.createTransport(smtpTransportOptions(config))
): Mailer {
  const config = mailConfigFromEnv(env)
  if (config) return createSmtpMailer(config, transportFor(config))
  if (env.NODE_ENV === 'production') {
    return async () => {
      throw new Error('Mail is not configured: set SMTP_TOKEN (and MAIL_FROM)')
    }
  }
  return async (message) => {
    console.log(
      `[mail] not configured, would send to ${message.to}\n` +
        `[mail] ${message.subject}\n${message.text}`
    )
  }
}
