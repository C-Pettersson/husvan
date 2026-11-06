// The allowlist says who may sign in and who may not. Better Auth's sign-up is
// off, so a user row only comes into existence through a login link. With
// signup closed a link is only sent to an address on this list; open signup
// (src/server/users/signup.ts) also lets in addresses it has not seen, and puts
// them on it. A blocked address stays on the list, marked, in both modes. See
// src/server/auth/magicLink.ts and the user.create hooks in src/lib/auth.ts.
import type { PrismaClient } from '@prisma/client'

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export type AddressStatus = 'allowed' | 'blocked' | 'unknown'

export async function addressStatus(
  prisma: Pick<PrismaClient, 'allowedEmail' | 'user'>,
  email: string
): Promise<AddressStatus> {
  const normalised = normaliseEmail(email)
  const row = await prisma.allowedEmail.findUnique({
    where: { email: normalised },
    select: { blockedAt: true },
  })
  if (row) return row.blockedAt ? 'blocked' : 'allowed'
  // Every account gets a row when it is created, and blocking keeps it. An
  // account without one was removed before blocking left a mark, so open signup
  // must not let it back in.
  const user = await prisma.user.findUnique({
    where: { email: normalised },
    select: { id: true },
  })
  return user ? 'blocked' : 'unknown'
}

// Blocking ends the sessions and deletes the tokens, but an access token Claude
// already holds is a signed JWT that stays valid until it expires. The MCP route
// asks this on every call, so that a block takes effect at once there too.
export async function isUserBlocked(
  prisma: Pick<PrismaClient, 'allowedEmail' | 'user'>,
  userId: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })
  return !user || (await addressStatus(prisma, user.email)) !== 'allowed'
}

export type AllowedEmailEntry = {
  email: string
  blockedAt: Date | null
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
      blockedAt: row.blockedAt,
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
    update: { blockedAt: null },
    create: { email: normalised, addedById },
  })
}

// Blocking an address ends the user's web sessions and Claude's tokens, so the
// change takes effect at once. The row stays, marked, or open signup would let
// the address straight back in. The user row and its houses stay too: the
// address can be allowed again later and nothing is lost.
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
    prisma.allowedEmail.update({
      where: { email: normalised },
      data: { blockedAt: new Date() },
    }),
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
