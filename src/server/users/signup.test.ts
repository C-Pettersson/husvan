import { describe, expect, it, vi } from 'vitest'
import { addressStatus, isUserBlocked, revokeEmail } from './allowlist'
import {
  NEW_ADDRESS_MAILS_PER_ACCOUNT,
  RECIPIENT_MAILS_PER_DAY,
  RECIPIENT_MAILS_PER_HOUR,
  decideLoginMail,
  mayCreateAccount,
  recipientHash,
  signupState,
} from './signup'

type Mail = { recipientHash: string; newAddress: boolean; createdAt: Date }

const now = new Date('2026-11-06T12:00:00Z')
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000)

function fake({
  open = true,
  settings = true,
  accountsPerDay = 10,
  allowed = [] as { email: string; blockedAt?: Date }[],
  users = [] as string[],
  accountsToday = 0,
  mails = [] as Mail[],
} = {}) {
  return {
    signupSettings: {
      findUnique: vi.fn(async () =>
        settings ? { open, accountsPerDay } : null
      ),
    },
    user: {
      count: vi.fn(async () => accountsToday),
      findUnique: vi.fn(
        async ({ where }: { where: { email?: string; id?: string } }) => {
          const email = where.email ?? where.id
          return email && users.includes(email) ? { id: email, email } : null
        }
      ),
    },
    allowedEmail: {
      findUnique: vi.fn(
        async ({ where }: { where: { email: string } }) =>
          allowed.find((a) => a.email === where.email) && {
            blockedAt:
              allowed.find((a) => a.email === where.email)?.blockedAt ?? null,
          }
      ),
    },
    loginMail: {
      count: vi.fn(
        async ({
          where,
        }: {
          where: {
            recipientHash?: string
            newAddress?: boolean
            createdAt: { gte: Date }
          }
        }) =>
          mails.filter(
            (m) =>
              m.createdAt >= where.createdAt.gte &&
              (where.recipientHash === undefined ||
                m.recipientHash === where.recipientHash) &&
              (where.newAddress === undefined ||
                m.newAddress === where.newAddress)
          ).length
      ),
    },
  } as never
}

const mailsTo = (email: string, count: number, at: Date): Mail[] =>
  Array.from({ length: count }, () => ({
    recipientHash: recipientHash(email),
    newAddress: false,
    createdAt: at,
  }))

describe('signupState', () => {
  it('is closed until an admin has saved settings', async () => {
    const state = await signupState(fake({ settings: false }), now)
    expect(state.status).toBe('invite_only')
  })

  it('pauses when the day has its accounts', async () => {
    const state = await signupState(fake({ accountsToday: 10 }), now)
    expect(state.status).toBe('paused')
  })

  it('pauses when the mail budget for new addresses is spent', async () => {
    const mails = Array.from(
      { length: 10 * NEW_ADDRESS_MAILS_PER_ACCOUNT },
      (_, i) => ({
        recipientHash: `h${i}`,
        newAddress: true,
        createdAt: minutesAgo(5),
      })
    )
    const state = await signupState(fake({ mails }), now)
    expect(state.status).toBe('paused')
  })
})

describe('decideLoginMail', () => {
  it('sends nothing to a new address while signup is closed', async () => {
    const prisma = fake({ open: false })
    expect(await decideLoginMail(prisma, 'new@example.com', now)).toEqual({
      send: false,
      reason: 'not_allowed',
    })
  })

  it('sends to a new address while signup is open', async () => {
    expect(await decideLoginMail(fake(), 'new@example.com', now)).toEqual({
      send: true,
      newAddress: true,
    })
  })

  it('still sends to an existing user when signup is closed or paused', async () => {
    const allowed = [{ email: 'owner@example.com' }]
    const closed = fake({ open: false, allowed })
    const paused = fake({ accountsToday: 10, allowed })
    for (const prisma of [closed, paused])
      expect(await decideLoginMail(prisma, 'owner@example.com', now)).toEqual({
        send: true,
        newAddress: false,
      })
  })

  it('never sends to a blocked address, open or not', async () => {
    const prisma = fake({
      allowed: [{ email: 'bad@example.com', blockedAt: minutesAgo(60) }],
    })
    expect(await decideLoginMail(prisma, 'bad@example.com', now)).toEqual({
      send: false,
      reason: 'not_allowed',
    })
  })

  it('limits mails to one recipient per hour', async () => {
    const email = 'owner@example.com'
    const allowed = [{ email }]
    const under = mailsTo(email, RECIPIENT_MAILS_PER_HOUR - 1, minutesAgo(10))
    expect(
      await decideLoginMail(fake({ allowed, mails: under }), email, now)
    ).toMatchObject({ send: true })
    const over = mailsTo(email, RECIPIENT_MAILS_PER_HOUR, minutesAgo(10))
    expect(
      await decideLoginMail(fake({ allowed, mails: over }), email, now)
    ).toEqual({ send: false, reason: 'rate_limited' })
  })

  it('limits mails to one recipient per day, and forgets older ones', async () => {
    const email = 'owner@example.com'
    const allowed = [{ email }]
    const over = mailsTo(email, RECIPIENT_MAILS_PER_DAY, minutesAgo(120))
    expect(
      await decideLoginMail(fake({ allowed, mails: over }), email, now)
    ).toEqual({ send: false, reason: 'rate_limited' })
    const old = mailsTo(email, RECIPIENT_MAILS_PER_DAY, minutesAgo(25 * 60))
    expect(
      await decideLoginMail(fake({ allowed, mails: old }), email, now)
    ).toMatchObject({ send: true })
  })

  it('counts plus addresses as the same inbox', async () => {
    const mails = mailsTo(
      'a@example.com',
      RECIPIENT_MAILS_PER_HOUR,
      minutesAgo(1)
    )
    expect(
      await decideLoginMail(fake({ mails }), 'a+other@example.com', now)
    ).toEqual({ send: false, reason: 'rate_limited' })
  })
})

describe('recipientHash', () => {
  it('treats case and plus tags as the same inbox, but not other addresses', () => {
    const hash = recipientHash('a@example.com', 'secret')
    expect(recipientHash('A+x@Example.com', 'secret')).toBe(hash)
    expect(recipientHash('b@example.com', 'secret')).not.toBe(hash)
  })

  it('depends on the secret', () => {
    expect(recipientHash('a@example.com', 'one')).not.toBe(
      recipientHash('a@example.com', 'two')
    )
  })
})

describe('mayCreateAccount', () => {
  it('lets an invited address in whatever the mode', async () => {
    const prisma = fake({ open: false, allowed: [{ email: 'a@example.com' }] })
    expect(await mayCreateAccount(prisma, 'a@example.com', now)).toBe(true)
  })

  it('stops a new address at the cap', async () => {
    expect(await mayCreateAccount(fake(), 'a@example.com', now)).toBe(true)
    expect(
      await mayCreateAccount(fake({ accountsToday: 10 }), 'a@example.com', now)
    ).toBe(false)
  })

  it('stops a new address when signup is closed, and a blocked one always', async () => {
    expect(
      await mayCreateAccount(fake({ open: false }), 'a@example.com', now)
    ).toBe(false)
    const prisma = fake({
      allowed: [{ email: 'a@example.com', blockedAt: minutesAgo(1) }],
    })
    expect(await mayCreateAccount(prisma, 'a@example.com', now)).toBe(false)
  })
})

describe('addressStatus', () => {
  it('treats an account without a row as blocked, not as new', async () => {
    const prisma = fake({ users: ['old@example.com'] })
    expect(await addressStatus(prisma, 'old@example.com')).toBe('blocked')
    expect(await addressStatus(prisma, 'new@example.com')).toBe('unknown')
  })
})

describe('isUserBlocked', () => {
  it('follows the address of the user', async () => {
    const email = 'a@example.com'
    expect(
      await isUserBlocked(fake({ users: [email], allowed: [{ email }] }), email)
    ).toBe(false)
    expect(
      await isUserBlocked(
        fake({ users: [email], allowed: [{ email, blockedAt: now }] }),
        email
      )
    ).toBe(true)
  })

  it('counts a user who no longer exists as blocked', async () => {
    expect(await isUserBlocked(fake(), 'gone')).toBe(true)
  })
})

describe('revokeEmail', () => {
  it('marks the address instead of deleting it, and ends its access', async () => {
    const update = vi.fn(() => 'updated')
    const remove = vi.fn(() => 'deleted')
    const prisma = {
      user: {
        findUnique: vi.fn(async ({ where }: { where: { id?: string } }) =>
          where.id ? { email: 'admin@example.com' } : { id: 'u1' }
        ),
      },
      allowedEmail: {
        findUnique: vi.fn(async () => ({ email: 'a@example.com' })),
        update,
        delete: remove,
      },
      session: { deleteMany: vi.fn() },
      oauthAccessToken: { deleteMany: vi.fn() },
      oauthRefreshToken: { deleteMany: vi.fn() },
      $transaction: vi.fn(async () => []),
    } as never
    const result = await revokeEmail(prisma, {
      email: 'a@example.com',
      actorId: 'admin',
    })
    expect(result).toBe('revoked')
    expect(update).toHaveBeenCalledWith({
      where: { email: 'a@example.com' },
      data: { blockedAt: expect.any(Date) },
    })
    expect(remove).not.toHaveBeenCalled()
  })
})
