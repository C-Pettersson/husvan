import type { PrismaClient } from '@prisma/client'
import { features, listSummary } from '@/server/forecast/compare'
import { analyseHouse, type Analysis } from '@/server/forecast/run'

// Every house with price, maintenance debt and adjusted price, and the
// features the list filters on. The houses page sends it with the page; the
// tRPC list gives the same.
export async function listHouses(prisma: PrismaClient, ownerId: string) {
  const houses = await prisma.house.findMany({
    where: { ownerId },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  })
  const analyses = await Promise.all(
    houses.map((h) => analyseHouse(prisma, { ownerId, houseId: h.id }))
  )
  return analyses
    .filter((a): a is Analysis => a !== null)
    .map((a) => ({
      ...listSummary(a),
      maintenanceDebt: a.debt.total,
      maintenanceAdjustedPrice: a.adjustedPrice,
      features: features(a),
      inspected: a.gaps.inspected,
    }))
}
