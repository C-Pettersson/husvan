// Open signup and the limits on login mail. Signup is closed until an admin
// opens it on /admin. Open, a new address gets a login mail and an account
// without being invited, up to a number of new accounts per day. Past that,
// signup pauses by itself until the day has passed; existing users are not
// affected.
//
// Cloudflare sees who sends a request, not who the mail goes to, so nothing in
// front of the app can stop someone from flooding another person's inbox from
// husvan.se. The limits per recipient are therefore here.
import { createHmac } from 'crypto'
import type { PrismaClient } from '@prisma/client'
import { addressStatus, normaliseEmail } from './allowlist'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const KEEP_MAIL_LOG = 2 * DAY

export const DEFAULT_ACCOUNTS_PER_DAY = 10
export const MAX_ACCOUNTS_PER_DAY = 1000
// Not every mail to a new address becomes an account, but a budget tied to the
// cap bounds what an attacker can send. Spending it pauses signup, nothing else.
export const NEW_ADDRESS_MAILS_PER_ACCOUNT = 5
export const RECIPIENT_MAILS_PER_HOUR = 5
export const RECIPIENT_MAILS_PER_DAY = 20

export type SignupStatus = 'invite_only' | 'open' | 'paused'

export type SignupState = {
  status: SignupStatus
  open: boolean
  accountsPerDay: number
  // Over the last 24 hours. Invited users count here too.
  accountsToday: number
  newAddressMailsToday: number
}

type Db = Pick<
  PrismaClient,
  'signupSettings' | 'user' | 'loginMail' | 'allowedEmail'
>

export async function signupState(
  prisma: Db,
  now = new Date()
): Promise<SignupState> {
  const since = new Date(now.getTime() - DAY)
  const [settings, accountsToday, newAddressMailsToday] = await Promise.all([
    prisma.signupSettings.findUnique({ where: { id: 1 } }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.loginMail.count({
      where: { newAddress: true, createdAt: { gte: since } },
    }),
  ])
  const open = settings?.open ?? false
  const accountsPerDay = settings?.accountsPerDay ?? DEFAULT_ACCOUNTS_PER_DAY
  const full =
    accountsToday >= accountsPerDay ||
    newAddressMailsToday >= accountsPerDay * NEW_ADDRESS_MAILS_PER_ACCOUNT
  return {
    status: !open ? 'invite_only' : full ? 'paused' : 'open',
    open,
    accountsPerDay,
    accountsToday,
    newAddressMailsToday,
  }
}

export async function setSignupSettings(
  prisma: Pick<PrismaClient, 'signupSettings'>,
  { open, accountsPerDay }: { open: boolean; accountsPerDay: number }
): Promise<void> {
  await prisma.signupSettings.upsert({
    where: { id: 1 },
    update: { open, accountsPerDay },
    create: { id: 1, open, accountsPerDay },
  })
}

// The address the mail limits count: a+1@x and a+2@x reach the same inbox.
// Keyed, so that the log cannot be matched against a list of addresses.
export function recipientHash(
  email: string,
  secret = process.env.BETTER_AUTH_SECRET ?? ''
): string {
  const [local, domain] = normaliseEmail(email).split('@')
  return createHmac('sha256', secret)
    .update(`${local.split('+')[0]}@${domain}`)
    .digest('hex')
}

export type LoginMailDecision =
  | { send: true; newAddress: boolean }
  | { send: false; reason: 'not_allowed' | 'rate_limited' }

export async function decideLoginMail(
  prisma: Db,
  email: string,
  now = new Date()
): Promise<LoginMailDecision> {
  const status = await addressStatus(prisma, email)
  if (status === 'blocked') return { send: false, reason: 'not_allowed' }
  const newAddress = status === 'unknown'
  if (newAddress && (await signupState(prisma, now)).status !== 'open')
    return { send: false, reason: 'not_allowed' }

  const recipient = recipientHash(email)
  const [lastHour, lastDay] = await Promise.all([
    prisma.loginMail.count({
      where: {
        recipientHash: recipient,
        createdAt: { gte: new Date(now.getTime() - HOUR) },
      },
    }),
    prisma.loginMail.count({
      where: {
        recipientHash: recipient,
        createdAt: { gte: new Date(now.getTime() - DAY) },
      },
    }),
  ])
  if (
    lastHour >= RECIPIENT_MAILS_PER_HOUR ||
    lastDay >= RECIPIENT_MAILS_PER_DAY
  )
    return { send: false, reason: 'rate_limited' }
  return { send: true, newAddress }
}

export async function recordLoginMail(
  prisma: Pick<PrismaClient, 'loginMail'>,
  { email, newAddress }: { email: string; newAddress: boolean },
  now = new Date()
): Promise<void> {
  await prisma.loginMail.create({
    data: { recipientHash: recipientHash(email), newAddress },
  })
  await prisma.loginMail.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - KEEP_MAIL_LOG) } },
  })
}

// The cap again when the account is created, since a link stays valid for ten
// minutes after it was sent. Only the account count applies here: someone who
// already holds a link should not lose it because the mail budget ran out.
export async function mayCreateAccount(
  prisma: Db,
  email: string,
  now = new Date()
): Promise<boolean> {
  const status = await addressStatus(prisma, email)
  if (status !== 'unknown') return status === 'allowed'
  const state = await signupState(prisma, now)
  return state.open && state.accountsToday < state.accountsPerDay
}

// Puts a new account on the list, so that /admin shows it, it can be blocked,
// and it keeps its access if signup is closed later.
export async function rememberAccount(
  prisma: Pick<PrismaClient, 'allowedEmail'>,
  email: string
): Promise<void> {
  const normalised = normaliseEmail(email)
  await prisma.allowedEmail.upsert({
    where: { email: normalised },
    update: {},
    create: { email: normalised },
  })
}
