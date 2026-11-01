import type { PrismaClient } from '@prisma/client'
import { municipalities, tariffChanges } from '../data/municipalities.mts'

// Upserts the municipalities and their tariff changes. Values the data file
// leaves null do not overwrite what is already stored.
export async function seedMunicipalities(prisma: PrismaClient) {
  for (const m of municipalities) {
    const values = Object.fromEntries(
      Object.entries({
        groundSnowLoadKnM2: m.groundSnowLoadKnM2,
        fgeo: m.fgeo,
        dvutC: m.dvutC,
        cloudburstMapUrl: m.cloudburstMapUrl,
      }).filter(([, v]) => v !== null)
    )
    await prisma.municipality.upsert({
      where: { code: m.code },
      update: { name: m.name, ...values },
      create: { code: m.code, name: m.name, ...values },
    })
  }

  for (const t of tariffChanges) {
    const key = {
      municipalityCode: t.municipalityCode,
      year: t.year,
      category: t.category,
    }
    await prisma.municipalTariffChange.upsert({
      where: { municipalityCode_year_category: key },
      update: { changeFraction: t.changeFraction, sourceUrl: t.sourceUrl },
      create: {
        ...key,
        changeFraction: t.changeFraction,
        sourceUrl: t.sourceUrl,
      },
    })
  }

  console.log(
    `Seeded ${municipalities.length} municipalities and ${tariffChanges.length} tariff changes`
  )
}
