// Answers to the open questions about a house (CLAUDE.md, "Öppna frågor"),
// by question id, as one change: values on the house and its parts, a new
// part for one the documents do not mention, and a restated work item for
// a cost. The questions are worked out again, so an answer can only settle
// one that is still open, and the change is validated like any other.
// From the web the answers are the user's own and approved at once, and
// can be undone; from MCP they are a draft the user approves.
import { z } from 'zod'
import type { PrismaClient } from '@prisma/client'
import type { WorkItemInput } from '@/server/forecast/forecast'
import type { Question } from '@/server/forecast/questions'
import { analyseHouse } from '@/server/forecast/run'
import type { ChangesInput, ValueInput } from './changes'
import { correct, type CorrectResult } from './correct'
import { proposeChanges, type ProposeResult } from './proposeChanges'

export const answerInput = z.object({
  questionId: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe(
      'How sure the answer is. Omitted: the option’s own confidence, or 1 for a value entered by hand.'
    ),
})

export type AnswerInput = z.infer<typeof answerInput>

type Built = { ok: true; input: ChangesInput } | { ok: false; errors: string[] }

async function build(
  prisma: PrismaClient,
  ownerId: string,
  houseId: string,
  answers: AnswerInput[]
): Promise<Built> {
  const a = await analyseHouse(prisma, { ownerId, houseId })
  if (!a) return { ok: false, errors: [`No house with id ${houseId}.`] }
  return answersToChanges(
    a.openQuestions().questions,
    a.view.workItems,
    answers
  )
}

// The change the answers make. Pure, for testing.
export function answersToChanges(
  questions: Question[],
  workItems: (WorkItemInput & {
    documentId?: string | null
    quote?: string | null
  })[],
  answers: AnswerInput[]
): Built {
  const open = new Map(questions.map((q) => [q.id, q]))
  const errors: string[] = []
  const input: ChangesInput = {
    houseValues: [],
    components: [],
    componentValues: [],
    workItems: [],
  }

  answers.forEach((answer, i) => {
    const where = `answers[${i}] ${answer.questionId}`
    const q = open.get(answer.questionId)
    if (!q) {
      errors.push(
        `${where}: not an open question of this house; it may be answered already. open_questions lists the current ones.`
      )
      return
    }
    const option = q.options.find((o) => o.value === answer.value)
    if (!option && !q.manual) {
      errors.push(
        `${where}: must be one of ${q.options.map((o) => JSON.stringify(o.value)).join(', ')}`
      )
      return
    }
    const value: ValueInput = {
      key: option?.key ?? q.key,
      value: answer.value,
      confidence: answer.confidence ?? option?.confidence ?? 1,
    }

    if (q.workItemId) {
      const w = workItems.find((x) => x.id === q.workItemId)
      if (!w || typeof answer.value !== 'number') {
        errors.push(`${where}: a cost in kronor`)
        return
      }
      // The work item restated with its cost, as on the web.
      input.workItems.push({
        replaces: w.id,
        kind: w.kind,
        severity: w.severity ?? undefined,
        description: w.description,
        yearMin: w.yearMin ?? undefined,
        yearMax: w.yearMax ?? undefined,
        costLowSek: answer.value,
        costHighSek: answer.value,
        documentId: w.documentId ?? undefined,
        quote: w.quote ?? undefined,
      })
    } else if (q.componentId === null) {
      input.houseValues.push(value)
    } else if (!q.documented) {
      // A part the documents do not mention: one new component for all
      // its answers.
      const part = input.components.find((c) => c.ref === q.componentId)
      if (part) part.values.push(value)
      else
        input.components.push({
          ref: q.componentId,
          type: q.type,
          values: [value],
        })
    } else {
      const part = input.componentValues.find(
        (c) => c.componentId === q.componentId
      )
      if (part) part.values.push(value)
      else
        input.componentValues.push({
          componentId: q.componentId,
          values: [value],
        })
    }
  })
  return errors.length ? { ok: false, errors } : { ok: true, input }
}

// Marks the user's own answers, so that only they can be undone.
export const ANSWER_COMMENT = 'Answer to an open question'

// The user's own answers on the web: approved at once with source USER.
export async function answerAsUser(
  prisma: PrismaClient,
  {
    ownerId,
    houseId,
    answers,
  }: { ownerId: string; houseId: string; answers: AnswerInput[] }
): Promise<CorrectResult> {
  const built = await build(prisma, ownerId, houseId, answers)
  if (!built.ok) return built
  return correct(prisma, {
    ownerId,
    houseId,
    input: built.input,
    comment: ANSWER_COMMENT,
  })
}

export type UndoResult =
  { ok: true } | { ok: false; error: 'not_found' | 'depended_on' }

// Takes back an answer given on the web: its changeset is rejected after
// the fact, so that everything it added stops counting, a new part
// included, which retractedAt cannot do since a component has none. Only
// the user's own answers, and not one that a later change builds on, such
// as a second answer about the part the first one added.
export async function undoAnswer(
  prisma: PrismaClient,
  {
    ownerId,
    houseId,
    changesetId,
  }: { ownerId: string; houseId: string; changesetId: string }
): Promise<UndoResult> {
  const changeset = await prisma.changeset.findFirst({
    where: {
      id: changesetId,
      houseId,
      house: { ownerId },
      status: 'APPROVED',
      source: 'USER',
      comment: ANSWER_COMMENT,
    },
    select: {
      components: { select: { id: true } },
      workItems: { select: { id: true } },
    },
  })
  if (!changeset) return { ok: false, error: 'not_found' }
  const components = changeset.components.map((c) => c.id)
  const workItems = changeset.workItems.map((w) => w.id)
  const elsewhere = {
    changesetId: { not: changesetId },
    changeset: { status: { not: 'REJECTED' as const } },
  }
  const [observations, items, parts] = await Promise.all([
    prisma.observation.count({
      where: { ...elsewhere, componentId: { in: components } },
    }),
    prisma.workItem.count({
      where: {
        ...elsewhere,
        OR: [
          { componentId: { in: components } },
          { replacesId: { in: workItems } },
        ],
      },
    }),
    prisma.component.count({
      where: {
        ...elsewhere,
        OR: [
          { parentId: { in: components } },
          { replacesId: { in: components } },
        ],
      },
    }),
  ])
  if (observations + items + parts > 0)
    return { ok: false, error: 'depended_on' }
  await prisma.changeset.update({
    where: { id: changesetId },
    data: { status: 'REJECTED', decidedAt: new Date() },
  })
  return { ok: true }
}

// Answers Claude passes on: a draft with source CLAUDE.
export async function answerAsDraft(
  prisma: PrismaClient,
  {
    ownerId,
    houseId,
    draftId,
    answers,
  }: {
    ownerId: string
    houseId: string
    draftId?: string
    answers: AnswerInput[]
  }
): Promise<ProposeResult> {
  const built = await build(prisma, ownerId, houseId, answers)
  if (!built.ok) return { ...built, warnings: [] }
  return proposeChanges(prisma, {
    ownerId,
    houseId,
    draftId,
    comment: 'Answers to the open questions',
    source: 'CLAUDE',
    input: built.input,
  })
}
