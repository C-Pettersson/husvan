// `yarn import:bki`: SCB's construction cost index for group-built small
// houses (byggkostnadsindex/faktorprisindex, TAB1368, gruppbyggda småhus,
// total, 1968 = 100), monthly from 1975. Published around the 15th for the
// month before; run after each publication.
//
// The forecast brings a price from year X to year Y with
// mean(index in Y) / mean(index in X).
import { PrismaClient } from '@prisma/client'
import { fetchTable } from './lib/scb.mts'

const SERIES = 'bki_small_houses'
const SOURCE_URL =
  'https://statistikdatabasen.scb.se/api/v2/tables/TAB1368/metadata?lang=sv'

const prisma = new PrismaClient()

async function main() {
  const rows = await fetchTable('TAB1368', {
    Hustyp: ['GRUPPSMÅ'],
    Kostnadsslag: ['TOTAL'],
    ContentsCode: ['PR0502A3'],
    Tid: ['*'],
  })

  let imported = 0
  for (const row of rows) {
    if (row.value === null) continue
    const match = /^(\d{4})M(\d{2})$/.exec(row.Tid)
    if (!match) throw new Error(`Unexpected period ${row.Tid}`)
    const period = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
    await prisma.priceIndex.upsert({
      where: { series_period: { series: SERIES, period } },
      update: { value: row.value, sourceUrl: SOURCE_URL },
      create: {
        series: SERIES,
        period,
        value: row.value,
        sourceUrl: SOURCE_URL,
      },
    })
    imported++
  }

  const latest = rows.filter((r) => r.value !== null).at(-1)
  console.log(
    `Imported ${imported} months of ${SERIES}, latest ${latest?.Tid} = ${latest?.value}`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
