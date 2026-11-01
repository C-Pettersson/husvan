// `yarn db:seed`: the user and the reference data that lives in this repo.
// Statistics that are published elsewhere (BKI, SCB, Brå) are loaded by the
// import scripts under scripts/ instead.
import { PrismaClient } from '@prisma/client'
import { seedUser } from './seed/user.mts'
import { seedLibrary } from './seed/library.mts'
import { seedMunicipalities } from './seed/municipalities.mts'

const prisma = new PrismaClient()

async function main() {
  await seedUser(prisma)
  await seedLibrary(prisma)
  await seedMunicipalities(prisma)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
