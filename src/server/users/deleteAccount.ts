// Erasure of an account (GDPR article 17) and the one exception to "Bara
// tillägg" in CLAUDE.md: when the user asks, every row and file about them goes.
import type { PrismaClient } from '@prisma/client'
import { deleteObject } from '@/server/storage/s3'
import { normaliseEmail } from './allowlist'

export type DeleteAccountResult =
  'deleted' | 'not_found' | 'last_admin' | 'storage_failed'

// Someone has to be able to manage the allowlist, and the release job recreates
// the seeded owner anyway, so the last administrator cannot leave this way.
export async function isLastAdmin(
  prisma: Pick<PrismaClient, 'user'>,
  userId: string
): Promise<boolean> {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true },
    take: 2,
  })
  return admins.length === 1 && admins[0].id === userId
}

export async function deleteAccount(
  prisma: PrismaClient,
  {
    userId,
    removeFile = deleteObject,
  }: { userId: string; removeFile?: (key: string) => Promise<void> }
): Promise<DeleteAccountResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })
  if (!user) return 'not_found'
  if (await isLastAdmin(prisma, userId)) return 'last_admin'

  const houses = await prisma.house.findMany({
    where: { ownerId: userId },
    select: { id: true },
  })
  const houseIds = houses.map((h) => h.id)
  const changesets = await prisma.changeset.findMany({
    where: {
      OR: [
        { houseId: { in: houseIds } },
        { assumptions: { some: { ownerId: userId } } },
      ],
    },
    select: { id: true },
  })
  const changesetIds = changesets.map((c) => c.id)
  const inHouses = { houseId: { in: houseIds } }
  const documentsOfUser = {
    OR: [inHouses, { changesetId: { in: changesetIds } }],
  }

  // Files first. A file left behind once its row is gone could never be found
  // again, while rows left behind by a failed delete let the user try again.
  const files = await prisma.document.findMany({
    where: { ...documentsOfUser, storagePath: { not: null } },
    select: { storagePath: true },
  })
  try {
    for (const file of files) await removeFile(file.storagePath!)
  } catch (error) {
    console.error('[deleteAccount] files', error)
    return 'storage_failed'
  }

  const email = normaliseEmail(user.email)
  // Children before parents: these foreign keys restrict. Sessions, logins and
  // Claude's tokens and consents cascade from the user. Actor has no owner, but
  // nothing writes to it in version 1.
  await prisma.$transaction([
    prisma.retraction.deleteMany({ where: inHouses }),
    prisma.observation.deleteMany({ where: inHouses }),
    prisma.workItem.deleteMany({ where: inHouses }),
    prisma.forecast.deleteMany({ where: inHouses }),
    prisma.assumption.deleteMany({
      where: { OR: [inHouses, { ownerId: userId }] },
    }),
    prisma.component.deleteMany({ where: inHouses }),
    prisma.document.deleteMany({ where: documentsOfUser }),
    prisma.changeset.deleteMany({ where: { id: { in: changesetIds } } }),
    prisma.house.deleteMany({ where: { ownerId: userId } }),
    // Login links and codes waiting to be used carry the address.
    prisma.verification.deleteMany({
      where: {
        OR: [
          { identifier: { contains: email } },
          { value: { contains: email } },
        ],
      },
    }),
    prisma.allowedEmail.deleteMany({ where: { email } }),
    prisma.user.delete({ where: { id: userId } }),
  ])
  return 'deleted'
}
