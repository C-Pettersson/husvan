// `yarn import:bra`: loads the Brå figures kept in scripts/data/bra.mts.
import { PrismaClient } from '@prisma/client'
import { summarize, upsertAreaStatistics } from './lib/areaStatistics.mts'
import { braStatistics } from './data/bra.mts'

const prisma = new PrismaClient()

async function main() {
  await upsertAreaStatistics(prisma, braStatistics)
  console.log(`Imported ${braStatistics.length} Brå values:`)
  summarize(braStatistics)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
