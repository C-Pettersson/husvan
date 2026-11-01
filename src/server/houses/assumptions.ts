// Forecast assumptions (CLAUDE.md, "Kostnadsprognos"): the user's own
// choices, approved directly. Append only; the newest row per (house, key)
// wins, and a row without a house is the default for all houses. Such a row
// has no owner, which holds while version 1 has one user.
import { z } from 'zod'
import type { PrismaClient } from '@prisma/client'

export const assumptionShape = {
  horizon_years: z.int().min(1).max(50).describe('Default 15.'),
  start_year: z.int().min(2000).max(2100).describe('Default the current year.'),
  interest_rate: z
    .number()
    .min(0)
    .max(0.3)
    .describe('Yearly rate as a fraction, 0.04 = 4 %. Turns on capital cost.'),
  loan_sek: z.number().nonnegative(),
  electricity_price_sek_kwh: z.number().min(0).max(20),
  district_heating_price_sek_kwh: z.number().min(0).max(20),
  operating_cost_trend: z
    .enum(['none', 'municipality'])
    .describe(
      'municipality trends running costs by the municipality’s tariff changes.'
    ),
}

export const assumptionValues = z.object(assumptionShape).partial()
export type AssumptionValues = z.infer<typeof assumptionValues>

export async function setAssumptions(
  prisma: PrismaClient,
  {
    ownerId,
    houseId,
    values,
  }: { ownerId: string; houseId?: string; values: AssumptionValues }
): Promise<{ ok: true; changesetId: string } | { ok: false; error: string }> {
  const entries = Object.entries(values).filter(([, v]) => v !== undefined)
  if (!entries.length) return { ok: false, error: 'No assumptions given.' }
  if (houseId) {
    const house = await prisma.house.findFirst({
      where: { id: houseId, ownerId },
      select: { id: true },
    })
    if (!house) return { ok: false, error: `No house with id ${houseId}.` }
  }

  const changeset = await prisma.$transaction(async (tx) => {
    const changeset = await tx.changeset.create({
      data: {
        houseId: houseId ?? null,
        source: 'USER',
        status: 'APPROVED',
        decidedAt: new Date(),
      },
    })
    await tx.assumption.createMany({
      data: entries.map(([key, value]) => ({
        houseId: houseId ?? null,
        key,
        value: value as string | number,
        changesetId: changeset.id,
      })),
    })
    return changeset
  })
  return { ok: true, changesetId: changeset.id }
}
