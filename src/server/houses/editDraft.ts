// Corrects an open draft row by row instead of rejecting it (CLAUDE.md,
// "Rätta ett utkast"). Rows that should not be approved move to a REJECTED
// changeset of their own, so they are hidden like any rejected row; new rows
// go into the draft as propose_changes writes them. Nothing is written when
// anything is wrong, and the draft is locked while it is edited so that an
// approval cannot slip in between.
import type { PrismaClient, ValueSource } from '@prisma/client'
import {
  isEmpty,
  validateChanges,
  validateDraftEdit,
  type ChangesInput,
  type DraftEditInput,
  type DraftRemoval,
  type Problems,
} from './changes'
import { insertChanges, loadContext, type Written } from './proposeChanges'

export type DraftCounts = {
  components: number
  observations: number
  workItems: number
}

export type EditDraftResult =
  | ({
      ok: true
      warnings: string[]
      removed: DraftCounts
      // What is left in the draft after this call.
      remaining: DraftCounts
    } & Written)
  | ({ ok: false } & Problems)

const counts = (r: DraftRemoval): DraftCounts => ({
  components: r.components.length,
  observations: r.observations.length,
  workItems: r.workItems.length,
})

export async function editDraft(
  prisma: PrismaClient,
  {
    ownerId,
    houseId,
    draftId,
    source,
    edit,
    changes,
  }: {
    ownerId: string
    houseId: string
    draftId: string
    // Who adds the new rows: CLAUDE through MCP, USER on the web.
    source: ValueSource
    edit: DraftEditInput
    changes: ChangesInput
  }
): Promise<EditDraftResult> {
  const refuse = (errors: string[], warnings: string[] = []) => ({
    ok: false as const,
    errors,
    warnings,
  })
  const draft = await prisma.changeset.findFirst({
    where: { id: draftId, houseId, status: 'DRAFT', house: { ownerId } },
    select: { id: true, source: true },
  })
  if (!draft) return refuse([`No open draft ${draftId} for this house.`])

  const where = { changesetId: draftId }
  const [components, observations, workItems] = await Promise.all([
    prisma.component.findMany({ where, select: { id: true, parentId: true } }),
    prisma.observation.findMany({
      where,
      select: { id: true, componentId: true },
    }),
    prisma.workItem.findMany({
      where,
      select: { id: true, componentId: true },
    }),
  ])
  const { errors, remove } = validateDraftEdit(edit, changes, {
    components,
    observations,
    workItems,
  })

  const ctx = await loadContext(prisma, houseId, draftId)
  // What this call removes is no longer there to build on.
  for (const id of remove.components) ctx.components.delete(id)
  for (const id of remove.workItems) ctx.workItems.delete(id)
  const adding = !isEmpty(changes)
  const checked = adding
    ? validateChanges(changes, ctx)
    : { errors: [], warnings: [] }
  errors.push(...checked.errors)
  if (errors.length) return refuse(errors, checked.warnings)

  const written = await prisma.$transaction(async (tx) => {
    const { count } = await tx.changeset.updateMany({
      where: { id: draftId, status: 'DRAFT' },
      data: { status: 'DRAFT' },
    })
    if (count !== 1) return null

    const removing =
      remove.components.length ||
      remove.observations.length ||
      remove.workItems.length
    if (removing) {
      const rejected = await tx.changeset.create({
        data: {
          houseId,
          source: draft.source,
          status: 'REJECTED',
          decidedAt: new Date(),
          comment: `Left out of draft ${draftId}`,
        },
        select: { id: true },
      })
      const data = { changesetId: rejected.id }
      // Observations and work items first: they point at the components.
      await tx.observation.updateMany({
        where: { ...where, id: { in: remove.observations } },
        data,
      })
      await tx.workItem.updateMany({
        where: { ...where, id: { in: remove.workItems } },
        data,
      })
      await tx.component.updateMany({
        where: { ...where, id: { in: remove.components } },
        data,
      })
    }

    const added: Written = adding
      ? await insertChanges(tx, {
          houseId,
          changesetId: draftId,
          source,
          input: changes,
          types: ctx.types,
        })
      : {
          draftId,
          components: {},
          counts: { components: 0, observations: 0, workItems: 0 },
        }
    const [c, o, w] = await Promise.all([
      tx.component.count({ where }),
      tx.observation.count({ where }),
      tx.workItem.count({ where }),
    ])
    return {
      ...added,
      remaining: { components: c, observations: o, workItems: w },
    }
  })
  if (!written)
    return refuse(
      [`Draft ${draftId} was decided meanwhile; propose a new draft.`],
      checked.warnings
    )
  return {
    ok: true,
    warnings: checked.warnings,
    removed: counts(remove),
    ...written,
  }
}
