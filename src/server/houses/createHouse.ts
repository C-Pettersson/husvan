// A new candidate house (CLAUDE.md, "Skrivflöde"): the core is written
// directly, as the anchor documents and drafts hang on; values given with it
// go into a draft.
import type { PrismaClient } from '@prisma/client'
import { houseQuotaProblem } from '@/server/users/quota'
import { validateChanges, type ValueInput, emptyChanges } from './changes'
import { externalIdsOf, loadExternalIds, matchesExternalId } from './externalId'
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

type HouseCore = {
  address: string
  municipalityCode?: string | null
  propertyDesignation?: string | null
  // booli_id and listing_id values (externalId.ts), when known.
  externalIds?: readonly string[]
}

// The same external listing id, the same property designation, or the same
// street in the same (or an unknown) municipality. Shared with corrections
// on the web.
export const isSameHouse = (h: HouseCore, other: HouseCore) =>
  Boolean(
    (other.externalIds ?? []).some((id) =>
      matchesExternalId(h.externalIds ?? [], id)
    ) ||
    (other.propertyDesignation &&
      normalize(h.propertyDesignation ?? '') ===
        normalize(other.propertyDesignation)) ||
    (street(h.address) === street(other.address) &&
      (!h.municipalityCode ||
        !other.municipalityCode ||
        h.municipalityCode === other.municipalityCode))
  )

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
  const [houses, externalIds] = await Promise.all([
    prisma.house.findMany({
      where: { ownerId },
      select: {
        id: true,
        address: true,
        municipalityCode: true,
        propertyDesignation: true,
      },
    }),
    loadExternalIds(prisma, ownerId),
  ])
  const duplicate = houses.find((h) =>
    isSameHouse(
      { ...h, externalIds: externalIds.get(h.id) },
      {
        address,
        municipalityCode,
        propertyDesignation,
        externalIds: externalIdsOf(houseValues),
      }
    )
  )
  if (duplicate)
    return {
      ok: false,
      errors: [
        `The house already exists as ${duplicate.id}; use get_house and propose_changes, or update_listing for price, bid and sale status.`,
      ],
      existingHouseId: duplicate.id,
    }

  const overQuota = await houseQuotaProblem(prisma, ownerId)
  if (overQuota) return { ok: false, errors: [overQuota] }

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
    ...emptyChanges,
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
        workItems: new Map(),
        replacedWorkItems: new Set(),
        pendingReplacements: new Map(),
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
