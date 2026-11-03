// @vitest-environment node
//
// Not a test of the code: a script run through vitest, since it needs the
// `@/` alias and the forecast's loaders. It reads the local database and
// writes the fixtures the forecast tests use, one house per JSON file under
// src/server/forecast/fixtures/, and a report of each house's figures for
// comparing a change before and after:
//
//   FORECAST_FIXTURES=export yarn vitest run scripts/forecast-fixtures
//   FORECAST_FIXTURES=report REPORT_OUT=<file> yarn vitest run scripts/forecast-fixtures
//
// DATABASE_URL must be set (vitest does not read .env).
import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { getHouse } from '@/server/houses/getHouse'
import { analyseHouse } from '@/server/forecast/run'
import { flagText } from '@/server/forecast/flags'

const mode = process.env.FORECAST_FIXTURES
const FIXTURES = resolve(__dirname, '../src/server/forecast/fixtures')

const slug = (address: string) =>
  address
    .split(',')[0]
    .toLowerCase()
    .replace(/å|ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

describe.skipIf(!mode)('forecast fixtures', () => {
  it('runs', async () => {
    const prisma = new PrismaClient()
    try {
      const houses = await prisma.house.findMany({
        select: { id: true, ownerId: true, address: true },
        orderBy: { createdAt: 'asc' },
      })
      if (mode === 'export') {
        const index = await prisma.priceIndex.findMany({
          where: { series: 'bki_small_houses' },
        })
        const byYear = new Map<number, number[]>()
        for (const r of index) {
          const y = r.period.getUTCFullYear()
          byYear.set(y, [...(byYear.get(y) ?? []), Number(r.value)])
        }
        const bki = Object.fromEntries(
          [...byYear]
            .sort(([a], [b]) => a - b)
            .map(([y, v]) => [y, v.reduce((a, b) => a + b, 0) / v.length])
        )
        mkdirSync(FIXTURES, { recursive: true })
        for (const h of houses) {
          const view = await getHouse(prisma, {
            ownerId: h.ownerId,
            houseId: h.id,
          })
          expect(view).not.toBeNull()
          // Drafts and the preview are not part of the house as analysed.
          const house: Partial<NonNullable<typeof view>> = { ...view! }
          delete house.drafts
          delete house.preview
          const file = resolve(FIXTURES, `${slug(h.address)}.json`)
          writeFileSync(
            file,
            JSON.stringify({ exportedAt: new Date(), house, bki }, null, 2)
          )
          console.log(`wrote ${file}`)
        }
      }
      if (mode === 'report') {
        const report = []
        for (const h of houses) {
          const a = await analyseHouse(prisma, {
            ownerId: h.ownerId,
            houseId: h.id,
          })
          expect(a).not.toBeNull()
          const debtByComponent = new Map<string, number>()
          for (const p of a!.debt.parts)
            if (p.componentId)
              debtByComponent.set(
                p.componentId,
                (debtByComponent.get(p.componentId) ?? 0) + p.sek.typical
              )
          report.push({
            address: h.address,
            startYear: a!.forecast.startYear,
            horizonYears: a!.forecast.horizonYears,
            maintenanceDebt: a!.debt.total,
            forecastTotal: a!.forecast.total,
            adjustedPrice: a!.adjustedPrice,
            gaps: a!.gaps,
            flags: a!.flags.map(flagText),
            plans: a!.plans.map((p) => ({
              componentId: p.componentId,
              type: p.type,
              name: p.name,
              assumed: p.assumed,
              basis: p.basis,
              installYear: p.installYear.typical,
              lifespan: p.lifespan.typical,
              quantity: p.quantity,
              costTypical: p.cost?.typical ?? null,
              debtTypical: debtByComponent.get(p.componentId) ?? 0,
              forecastTypical:
                a!.forecast.items
                  .filter((i) => i.componentId === p.componentId)
                  .reduce((t, i) => t + i.total.typical, 0) ?? 0,
              flags: p.flags.map(flagText),
            })),
          })
        }
        const out = process.env.REPORT_OUT ?? 'forecast-report.json'
        writeFileSync(out, JSON.stringify(report, null, 2))
        console.log(`wrote ${out}`)
      }
    } finally {
      await prisma.$disconnect()
    }
  }, 120_000)
})
