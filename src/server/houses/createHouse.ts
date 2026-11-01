// A new candidate house (CLAUDE.md, "Skrivflöde"): the core is written
// directly, as the anchor documents and drafts hang on; values given with it
// go into a draft.
import type { PrismaClient } from '@prisma/client'
import { validateChanges, type ValueInput } from './changes'
import { insertChanges, loadLibrary, type Written } from './proposeChanges'

export type CreateHouseResult =
  | {
      ok: true
      houseId: string
      draft: Written | null
      warnings: string[]
    }
  | { ok: false; errors: string[]; existingHouseId?: string }

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

// "Yxgränd 6, 973 42 Luleå" and "yxgränd 6" are the same house.
const street = (address: string) => normalize(address.split(',')[0])

export async function createHouse(
  prisma: PrismaClient,
  {
    ownerId,
    address,
    municipalityCode,
    propertyDesignation,
    houseValues,
    comment,
  }: {
    ownerId: string
    address: string
    municipalityCode?: string
    propertyDesignation?: string
    houseValues: ValueInput[]
    comment?: string
  }
): Promise<CreateHouseResult> {
  const houses = await prisma.house.findMany({
    where: { ownerId },
    select: {
      id: true,
      address: true,
      municipalityCode: true,
      propertyDesignation: true,
    },
  })
  const duplicate = houses.find(
    (h) =>
      (propertyDesignation &&
        normalize(h.propertyDesignation ?? '') ===
          normalize(propertyDesignation)) ||
      (street(h.address) === street(address) &&
        (!h.municipalityCode ||
          !municipalityCode ||
          h.municipalityCode === municipalityCode))
  )
  if (duplicate)
    return {
      ok: false,
      errors: [
        `The house already exists as ${duplicate.id}; use get_house and propose_changes.`,
      ],
      existingHouseId: duplicate.id,
    }

  if (municipalityCode) {
    const known = await prisma.municipality.findMany({
      select: { code: true, name: true },
    })
    if (!known.some((m) => m.code === municipalityCode))
      return {
        ok: false,
        errors: [
          `Unknown municipality ${municipalityCode}. Known: ${known.map((m) => `${m.code} ${m.name}`).join(', ')}.`,
        ],
      }
  }

  // No documents exist for a house that does not exist yet, so the values
  // cannot cite one; save_document and propose_changes come after.
  const types = await loadLibrary(prisma)
  const input = {
    houseValues,
    components: [],
    componentValues: [],
    workItems: [],
  }
  const problems = houseValues.length
    ? validateChanges(input, {
        types,
        components: new Map(),
        replaced: new Set(),
        documents: new Set(),
      })
    : { errors: [], warnings: [] }
  if (problems.errors.length) return { ok: false, errors: problems.errors }

  return prisma.$transaction(async (tx) => {
    const house = await tx.house.create({
      data: {
        ownerId,
        address,
        municipalityCode: municipalityCode ?? null,
        propertyDesignation: propertyDesignation ?? null,
      },
    })
    let draft: Written | null = null
    if (houseValues.length) {
      const changeset = await tx.changeset.create({
        data: { houseId: house.id, source: 'CLAUDE', comment: comment ?? null },
      })
      draft = await insertChanges(tx, {
        houseId: house.id,
        changesetId: changeset.id,
        source: 'CLAUDE',
        input,
        types,
      })
    }
    return {
      ok: true as const,
      houseId: house.id,
      draft,
      warnings: problems.warnings,
    }
  })
}
