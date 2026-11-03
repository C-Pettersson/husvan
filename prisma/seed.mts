// `yarn db:seed`: the user and the reference data that lives in this repo.
// Statistics that are published elsewhere (BKI, SCB, Brå) are loaded by the
// import scripts under scripts/ instead.
//
// `yarn db:seed:add` (`--add-only`) is what the deploy Job runs after the
// migrations (CLAUDE.md, "Leverans och drift"): it adds what the database
// lacks and changes nothing that is stored. The owner is seeded only when
// SEED_USER_EMAIL is set and the user does not exist yet. The log names the
// rows the full seed would change, so a seed by hand is a deliberate step.
import { PrismaClient } from '@prisma/client'
import type { SeedMode } from '../src/server/library/seedMerge.ts'
import { seedUser } from './seed/user.mts'
import { seedLibrary } from './seed/library.mts'
import { seedMunicipalities } from './seed/municipalities.mts'

const prisma = new PrismaClient()
const mode: SeedMode = process.argv.includes('--add-only') ? 'add_only' : 'full'

async function main() {
  console.log(`Seeding in ${mode === 'add_only' ? 'add-only' : 'full'} mode`)
  await seedUser(prisma, mode)
  await seedLibrary(prisma, mode)
  await seedMunicipalities(prisma, mode)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
