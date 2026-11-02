// The allowlist decides who may sign in. Better Auth's sign-up is off, so a
// user row only comes into existence through a login link, and a link is only
// sent to an address on this list (see src/server/auth/magicLink.ts and the
// user.create hook in src/lib/auth.ts).
import type { PrismaClient } from '@prisma/client'

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function isEmailAllowed(
  prisma: Pick<PrismaClient, 'allowedEmail'>,
  email: string
): Promise<boolean> {
  const row = await prisma.allowedEmail.findUnique({
    where: { email: normaliseEmail(email) },
    select: { email: true },
  })
  return row !== null
}

export type AllowedEmailEntry = {
  email: string
  createdAt: Date
  addedBy: string | null
  user: { name: string; role: 'USER' | 'ADMIN'; lastSeenAt: Date | null } | null
}

export async function listAllowedEmails(
  prisma: PrismaClient
): Promise<AllowedEmailEntry[]> {
  const rows = await prisma.allowedEmail.findMany({
    orderBy: { createdAt: 'asc' },
    include: { addedBy: { select: { email: true } } },
  })
  const users = await prisma.user.findMany({
    where: { email: { in: rows.map((r) => r.email) } },
    select: {
      email: true,
      name: true,
      role: true,
      sessions: {
        select: { updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 1,
      },
    },
  })
  const byEmail = new Map(users.map((u) => [u.email, u]))
  return rows.map((row) => {
    const user = byEmail.get(row.email)
    return {
      email: row.email,
      createdAt: row.createdAt,
      addedBy: row.addedBy?.email ?? null,
      user: user
        ? {
            name: user.name,
            role: user.role,
            lastSeenAt: user.sessions[0]?.updatedAt ?? null,
          }
        : null,
    }
  })
}

export async function allowEmail(
  prisma: PrismaClient,
  { email, addedById }: { email: string; addedById: string }
): Promise<void> {
  const normalised = normaliseEmail(email)
  await prisma.allowedEmail.upsert({
    where: { email: normalised },
    update: {},
    create: { email: normalised, addedById },
  })
}

// Removing an address ends the user's web sessions and Claude's tokens, so the
// change takes effect at once. The user row and its houses stay: the address
// can be allowed again later and nothing is lost.
export async function revokeEmail(
  prisma: PrismaClient,
  { email, actorId }: { email: string; actorId: string }
): Promise<'revoked' | 'is_self' | 'not_found'> {
  const normalised = normaliseEmail(email)
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { email: true },
  })
  if (actor?.email === normalised) return 'is_self'
  const row = await prisma.allowedEmail.findUnique({
    where: { email: normalised },
  })
  if (!row) return 'not_found'
  const user = await prisma.user.findUnique({
    where: { email: normalised },
    select: { id: true },
  })
  await prisma.$transaction([
    prisma.allowedEmail.delete({ where: { email: normalised } }),
    ...(user
      ? [
          prisma.session.deleteMany({ where: { userId: user.id } }),
          prisma.oauthAccessToken.deleteMany({ where: { userId: user.id } }),
          prisma.oauthRefreshToken.deleteMany({ where: { userId: user.id } }),
        ]
      : []),
  ])
  return 'revoked'
}
