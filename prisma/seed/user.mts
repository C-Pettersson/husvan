// Creates or updates the one user. Sign-up is disabled in Better Auth, so this
// is the only way an account comes into existence. Running it again with a new
// SEED_USER_PASSWORD changes the password.
import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { hashPassword } from 'better-auth/crypto'

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not set`)
  return value
}

export async function seedUser(prisma: PrismaClient) {
  const email = requireEnv('SEED_USER_EMAIL').toLowerCase()
  const name = requireEnv('SEED_USER_NAME')
  const password = requireEnv('SEED_USER_PASSWORD')
  if (password.length < 8) {
    throw new Error('SEED_USER_PASSWORD must be at least 8 characters')
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: { id: randomUUID(), email, name, emailVerified: true },
  })

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

  console.log(`Seeded user ${email}`)
}
