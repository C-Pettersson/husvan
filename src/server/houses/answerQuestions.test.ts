import { describe, expect, it } from 'vitest'
import type { Question } from '@/server/forecast/questions'
import { answersToChanges } from './answerQuestions'

const question = (q: Partial<Question>): Question => ({
  id: 'x',
  how: 'look',
  options: [],
  manual: null,
  componentId: null,
  type: 'house',
  name: null,
  documented: true,
  key: 'k',
  why: 'missing',
  answers: [],
  swing: null,
  ...q,
})

const ROOF = '0b5c7f0e-0000-4000-8000-000000000001'
const ITEM = '0b5c7f0e-0000-4000-8000-000000000002'

const questions: Question[] = [
  question({
    id: `${ROOF}:condition`,
    componentId: ROOF,
    type: 'roof_covering',
    key: 'condition',
    options: [4, 3].map((value) => ({
      value,
      confidence: 0.8,
      label: String(value),
      meaning: { kind: 'condition' },
    })),
  }),
  question({
    id: `${ROOF}:installation_year`,
    componentId: ROOF,
    type: 'roof_covering',
    key: 'installation_year',
    options: [
      {
        value: 2023,
        confidence: 0.7,
        label: '0–5 years ago',
        meaning: { kind: 'years_ago', from: 0, to: 5 },
      },
    ],
    manual: { datatype: 'year', min: 1800, max: 2026 },
  }),
  question({
    id: 'assumed:electrical_panel:rcd',
    componentId: 'assumed:electrical_panel',
    type: 'electrical_panel',
    documented: false,
    key: 'rcd',
    options: [true, false].map((value) => ({
      value,
      confidence: 0.9,
      label: String(value),
      meaning: { kind: 'boolean' },
    })),
  }),
  question({
    id: 'assumed:electrical_panel:installation_year',
    componentId: 'assumed:electrical_panel',
    type: 'electrical_panel',
    documented: false,
    key: 'installation_year',
    manual: { datatype: 'year' },
  }),
  question({
    id: 'house:radon_bq_m3',
    key: 'radon_bq_m3',
    options: [
      {
        value: false,
        key: 'radon_measured',
        confidence: 1,
        label: 'not measured',
        meaning: { kind: 'not_measured' },
      },
    ],
    manual: { datatype: 'number', unit: 'Bq/m3' },
  }),
  question({
    id: `work_item:${ITEM}`,
    componentId: ROOF,
    type: 'roof_covering',
    key: 'cost',
    why: 'no_cost',
    workItemId: ITEM,
    manual: { datatype: 'number', unit: 'SEK' },
  }),
]

const workItems = [
  {
    id: ITEM,
    componentId: ROOF,
    kind: 'REPAIR' as const,
    severity: 'DEFECT' as const,
    description: 'Byt trasiga takpannor',
    yearMin: null,
    yearMax: null,
    costLowSek: null,
    costHighSek: null,
    documentId: null,
    quote: 'Trasiga takpannor',
  },
]

describe('answersToChanges', () => {
  it('puts each answer where it belongs', () => {
    const r = answersToChanges(questions, workItems, [
      { questionId: `${ROOF}:condition`, value: 3 },
      { questionId: `${ROOF}:installation_year`, value: 2012 },
      { questionId: 'assumed:electrical_panel:rcd', value: true },
      { questionId: 'assumed:electrical_panel:installation_year', value: 2015 },
      { questionId: 'house:radon_bq_m3', value: false },
      { questionId: `work_item:${ITEM}`, value: 15000 },
    ])
    if (!r.ok) throw new Error(r.errors.join('\n'))
    // The option's confidence, or 1 for a value typed by hand.
    expect(r.input.componentValues).toEqual([
      {
        componentId: ROOF,
        values: [
          { key: 'condition', value: 3, confidence: 0.8 },
          { key: 'installation_year', value: 2012, confidence: 1 },
        ],
      },
    ])
    // One new panel for both answers about it.
    expect(r.input.components).toEqual([
      {
        ref: 'assumed:electrical_panel',
        type: 'electrical_panel',
        values: [
          { key: 'rcd', value: true, confidence: 0.9 },
          { key: 'installation_year', value: 2015, confidence: 1 },
        ],
      },
    ])
    expect(r.input.houseValues).toEqual([
      { key: 'radon_measured', value: false, confidence: 1 },
    ])
    expect(r.input.workItems).toEqual([
      {
        replaces: ITEM,
        kind: 'REPAIR',
        severity: 'DEFECT',
        description: 'Byt trasiga takpannor',
        yearMin: undefined,
        yearMax: undefined,
        costLowSek: 15000,
        costHighSek: 15000,
        documentId: undefined,
        quote: 'Trasiga takpannor',
      },
    ])
  })

  it('takes the confidence the caller gives', () => {
    const r = answersToChanges(questions, workItems, [
      { questionId: `${ROOF}:condition`, value: 4, confidence: 0.5 },
    ])
    expect(r.ok && r.input.componentValues[0].values[0].confidence).toBe(0.5)
  })

  it('refuses everything when one answer is not an option or not open', () => {
    const r = answersToChanges(questions, workItems, [
      { questionId: `${ROOF}:installation_year`, value: 2012 },
      { questionId: `${ROOF}:condition`, value: 7 },
      { questionId: `${ROOF}:material`, value: 'clay_tile' },
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors).toHaveLength(2)
      expect(r.errors[0]).toContain('must be one of 4, 3')
      expect(r.errors[1]).toContain('not an open question')
    }
  })
})
