// Corrections the user makes on the web (CLAUDE.md, "Skrivflöde"): approved
// directly with source USER, which wins over Claude's reading. Validated
// like a draft, so the web cannot store what MCP would refuse. Retracting a
// value or dismissing a work item sets retractedAt, and the house's core
// fields change in place; nothing else is ever updated.
import type { HouseStatus, PrismaClient } from '@prisma/client'
import { validateChanges, type ChangesInput } from './changes'
import { isSameHouse } from './createHouse'
import { insertChanges, loadContext } from './proposeChanges'

export type CorrectResult =
  { ok: true; changesetId: string } | { ok: false; errors: string[] }

const ownHouse = (prisma: PrismaClient, ownerId: string, houseId: string) =>
  prisma.house.findFirst({
    where: { id: houseId, ownerId },
    select: { id: true },
  })

export async function correct(
  prisma: PrismaClient,
  {
    ownerId,
    houseId,
    input,
  }: { ownerId: string; houseId: string; input: ChangesInput }
): Promise<CorrectResult> {
  if (!(await ownHouse(prisma, ownerId, houseId)))
    return { ok: false, errors: [`No house with id ${houseId}.`] }
  const ctx = await loadContext(prisma, houseId)
  const { errors } = validateChanges(input, ctx)
  if (errors.length) return { ok: false, errors }

  const changesetId = await prisma.$transaction(async (tx) => {
    const changeset = await tx.changeset.create({
      data: {
        houseId,
        source: 'USER',
        status: 'APPROVED',
        decidedAt: new Date(),
      },
    })
    await insertChanges(tx, {
      houseId,
      changesetId: changeset.id,
      source: 'USER',
      input,
      types: ctx.types,
    })
    return changeset.id
  })
  return { ok: true, changesetId }
}

// A value or work item that is wrong, or that the user dismisses. Only
// approved rows: a draft is rejected as a whole.
export async function retract(
  prisma: PrismaClient,
  {
    ownerId,
    houseId,
    observationId,
    workItemId,
  }: {
    ownerId: string
    houseId: string
    observationId?: string
    workItemId?: string
  }
): Promise<boolean> {
  if (!(await ownHouse(prisma, ownerId, houseId))) return false
  const where = {
    houseId,
    retractedAt: null,
    changeset: { status: 'APPROVED' as const },
  }
  const data = { retractedAt: new Date() }
  if (observationId) {
    const { count } = await prisma.observation.updateMany({
      where: { ...where, id: observationId },
      data,
    })
    return count === 1
  }
  if (!workItemId) return false
  // A dismissed work item takes the items it restated with it; otherwise
  // the one it replaced would count again.
  const chain: string[] = []
  for (let id: string | null = workItemId; id && !chain.includes(id);) {
    chain.push(id)
    const row: { replacesId: string | null } | null =
      await prisma.workItem.findFirst({
        where: { id, houseId },
        select: { replacesId: true },
      })
    id = row?.replacesId ?? null
  }
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.workItem.updateMany({
      where: { ...where, id: workItemId },
      data,
    })
    if (count !== 1) return false
    await tx.workItem.updateMany({
      where: { ...where, id: { in: chain.slice(1) } },
      data,
    })
    return true
  })
}

export type CoreInput = {
  address?: string
  propertyDesignation?: string | null
  municipalityCode?: string | null
  status?: HouseStatus
}

// The house's core fields, the owner's own. The same uniqueness as
// create_house, so that a correction cannot make two houses one.
export async function updateCore(
  prisma: PrismaClient,
  {
    ownerId,
    houseId,
    core,
  }: { ownerId: string; houseId: string; core: CoreInput }
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const houses = await prisma.house.findMany({
    where: { ownerId },
    select: {
      id: true,
      address: true,
      municipalityCode: true,
      propertyDesignation: true,
    },
  })
  const house = houses.find((h) => h.id === houseId)
  if (!house) return { ok: false, errors: [`No house with id ${houseId}.`] }
  const errors: string[] = []
  const next = { ...house, ...core }
  const duplicate = houses.find((h) => h.id !== houseId && isSameHouse(h, next))
  if (duplicate) errors.push(`duplicate: ${duplicate.address}`)
  if (core.municipalityCode) {
    const known = await prisma.municipality.findUnique({
      where: { code: core.municipalityCode },
      select: { code: true },
    })
    if (!known) errors.push('municipalityCode: unknown municipality')
  }
  if (errors.length) return { ok: false, errors }
  await prisma.house.update({ where: { id: houseId }, data: core })
  return { ok: true }
}
