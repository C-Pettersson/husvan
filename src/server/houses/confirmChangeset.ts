// Approves or rejects a draft (CLAUDE.md, "Skrivflöde"). Only the status
// changes; rejected rows stay in the tables and are never shown. Shared with
// the MCP tool confirm_changes.
import type { PrismaClient } from '@prisma/client'

export type Decision = 'approve' | 'reject'

export async function confirmChangeset(
  prisma: PrismaClient,
  {
    ownerId,
    changesetId,
    decision,
  }: { ownerId: string; changesetId: string; decision: Decision }
): Promise<'APPROVED' | 'REJECTED' | null> {
  const status = decision === 'approve' ? 'APPROVED' : 'REJECTED'
  // The status condition makes a second decision on the same draft a no-op.
  const { count } = await prisma.changeset.updateMany({
    where: { id: changesetId, status: 'DRAFT', house: { ownerId } },
    data: { status, decidedAt: new Date() },
  })
  return count === 1 ? status : null
}
