// Creates or updates the owner: an ADMIN user whose address is on the
// allowlist, so a login link can be requested at /login. Sign-up is disabled
// in Better Auth; other users are added on the admin page.
//
// SEED_USER_PASSWORD is optional. When set, an email and password login is
// created or updated as well; running the seed again with a new value changes
// the password. Without it the owner signs in with a login link only.
import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { hashPassword } from 'better-auth/crypto'
import type { SeedMode } from '../../src/server/library/seedMerge.ts'

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not set`)
  return value
}

export async function seedUser(prisma: PrismaClient, mode: SeedMode = 'full') {
  // In add-only mode the owner is created once and never changed: without
  // SEED_USER_EMAIL, or when the user exists, nothing happens.
  if (mode === 'add_only') {
    const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase()
    if (!email) {
      console.log('No SEED_USER_EMAIL; user left alone')
      return
    }
    if (await prisma.user.findUnique({ where: { email } })) {
      console.log(`User ${email} exists; left alone`)
      return
    }
  }
  const email = requireEnv('SEED_USER_EMAIL').toLowerCase()
  const name = requireEnv('SEED_USER_NAME')
  const password = process.env.SEED_USER_PASSWORD?.trim()
  if (password && password.length < 8) {
    throw new Error('SEED_USER_PASSWORD must be at least 8 characters')
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role: 'ADMIN' },
    create: {
      id: randomUUID(),
      email,
      name,
      emailVerified: true,
      role: 'ADMIN',
    },
  })
  await prisma.allowedEmail.upsert({
    where: { email },
    update: {},
    create: { email, addedById: user.id },
  })

  if (password) {
    // Better Auth keeps the email and password login as an account with
    // providerId 'credential' and accountId equal to the user id.
    const passwordHash = await hashPassword(password)
    const existing = await prisma.account.findFirst({
      where: { userId: user.id, providerId: 'credential' },
    })
    if (existing) {
      await prisma.account.update({
        where: { id: existing.id },
        data: { password: passwordHash },
      })
    } else {
      await prisma.account.create({
        data: {
          id: randomUUID(),
          accountId: user.id,
          providerId: 'credential',
          userId: user.id,
          password: passwordHash,
        },
      })
    }
  }

  console.log(`Seeded user ${email}${password ? ' with password' : ''}`)
}
