// What the analysis of a house does not know yet, and how much each answer
// could move it (CLAUDE.md, "Öppna frågor"): every input the forecast reads
// that is missing, guessed or uncertain, with the maintenance debt and the
// forecast total for each possible answer, one input at a time. Each
// question also says how it is answered: the quick options a form shows and
// the input for any other value. Claude turns the list into a short
// checklist for a viewing; the server only computes. Pure: the caller loads
// the house and the library.
import {
  RISK_FOUNDATIONS,
  flatten,
  valueOf,
  type Risk,
} from '@/server/houses/derive'
import type { ComponentView, KeyValueView } from '@/server/houses/getHouse'
import { HOUSE_KEYS } from '@/server/library/houseKeys'
import type { AttributeDefinition } from '@/server/library/schema'
import { maintenanceDebt } from './debt'
import { computeForecast, workItemCost, type ForecastInput } from './forecast'
import type { Flag, FlagCode } from './flags'
import {
  ASSUMED_PREFIX,
  CONFIDENT,
  planComponents,
  type ComponentPlan,
  type Library,
} from './plan'

export type Answer = string | number | boolean

// Typical scenario, start-year kronor.
export type Effect = { maintenanceDebtSek: number; forecastSek: number }

// What a quick option stands for, so that a form can word it in the
// reader's language: a choice's own label in the type library, yes or no,
// a number as it is, a condition grade, the part being original, or a span
// of years ago.
export type OptionMeaning =
  | { kind: 'choice' | 'boolean' | 'number' | 'condition' | 'not_measured' }
  | { kind: 'original'; year: number }
  | { kind: 'years_ago'; from: number; to: number }

export type QuestionOption = {
  value: Answer
  // Stored under another key than the question's, such as radon_measured.
  key?: string
  // How sure an answer by this option is: a span of years is approximate.
  confidence: number
  label: string // English, for Claude
  meaning: OptionMeaning
}

// Any other value than the quick options; null when only they apply.
export type ManualInput = {
  datatype: 'year' | 'number'
  unit?: string
  min?: number
  max?: number
}

export type Question = {
  // Stable while the question is open: <componentId or house>:<key>, or
  // work_item:<id>. answerQuestions looks it up again.
  id: string
  // Whether the answer is usually seen at the house or asked of the agent
  // or seller. A default for the form; Claude may judge otherwise.
  how: 'look' | 'ask'
  options: QuestionOption[]
  manual: ManualInput | null
  // The part asked about. componentId null is the house itself; a part the
  // documents do not mention (documented: false) has id assumed:<type>,
  // whether the forecast assumes it or only reads it as context.
  componentId: string | null
  type: string // component type, or 'house'
  name: string | null
  documented: boolean
  key: string
  why: 'missing' | 'uncertain' | 'estimated' | 'no_cost'
  // The current value, when it is uncertain.
  now?: { value: unknown; confidence: number | null }
  // What the forecast uses meanwhile, such as the construction year.
  usedNow?: number
  // The totals with each answer tried; the rest of the house as it is.
  answers: ({ value: Answer } & Effect)[]
  // Largest minus smallest total over the answers, or the range of a
  // running cost over the horizon. null when nothing can be computed, such
  // as a quantity estimated from the living area.
  swing: Effect | null
  // A flagged risk the answer decides; risks are never turned into kronor.
  decides?: Risk['kind']
  workItemId?: string
}

// A question before its form is added.
type Bare = Omit<Question, 'id' | 'how' | 'options' | 'manual'>

export type QuestionInput = {
  components: ComponentView[]
  houseValues: KeyValueView[]
  library: Library
  // Each type's attribute schema, for the answers a choice can have.
  attributes: Map<string, Record<string, AttributeDefinition>>
  forecast: Omit<ForecastInput, 'plans'>
}

export type OpenQuestions = {
  now: Effect
  // Without an inspection protocol the defects are unknown, which no
  // question here can settle.
  inspected: boolean
  questions: Question[]
}

// Flags that say a part's quantity is not its own. An area or a length
// estimated from the living area is the method, not a gap, since nobody
// measures a roof at a viewing; a count can be taken, and a missing
// quantity leaves the part without a cost.
const ESTIMATED: FlagCode[] = [
  'quantity_estimated',
  'quantity_estimated_shared',
  'quantity_from_footprint',
  'quantity_from_footprint_shared',
  'quantity_one_assumed',
]
const askQuantity = (f: Flag) =>
  f.code === 'quantity_missing' ||
  (ESTIMATED.includes(f.code) && (f.params?.key ?? 'quantity') === 'quantity')

// Floors a Swedish house usually has; 1.5 is a storey under the roof.
const FLOOR_ANSWERS = [1, 1.5, 2]

// Condition 1, replacement within two years, is a defect, which the
// inspection reports as a work item. Trying it would make every part look
// as if it might be broken; the question is how worn it is. It is still an
// option to answer with.
const CONDITIONS = [2, 3, 4, 5]

// Running lines worked out from energy rather than stated (running.ts).
const HEATING_ESTIMATES = ['heating_from_energy_use', 'heating_estimated']

// House keys that every part depends on; no single answer can be tried.
const CORE_HOUSE_KEYS = ['construction_year', 'living_area']

const answered = (key: string, value: Answer): KeyValueView => ({
  key,
  current: {
    id: 'answer',
    key,
    value,
    unit: null,
    source: 'USER',
    confidence: 1,
    quote: null,
    documentId: null,
    recordedAt: new Date(0),
    draft: false,
  },
  alternatives: [],
})

const withValue = (values: KeyValueView[], key: string, value: Answer) => [
  ...values.filter((v) => v.key !== key),
  answered(key, value),
]

// The house with one answer given. A part the documents do not mention
// becomes one with only that value, still marked assumed, so that nothing
// else about it changes.
function withAnswer(
  components: ComponentView[],
  target: { componentId: string; type: string },
  key: string,
  value: Answer
): ComponentView[] {
  if (target.componentId.startsWith(ASSUMED_PREFIX))
    return [
      ...components,
      {
        id: target.componentId,
        type: target.type,
        name: null,
        draft: false,
        values: [answered(key, value)],
        children: [],
      },
    ]
  const set = (list: ComponentView[]): ComponentView[] =>
    list.map((c) =>
      c.id === target.componentId
        ? { ...c, values: withValue(c.values, key, value) }
        : { ...c, children: set(c.children) }
    )
  return set(components)
}

// Distinct years from the oldest to the start year.
const years = (oldest: number, ...rest: number[]) =>
  [...new Set([oldest, ...rest])].filter((y) => y >= oldest)

// The attributes whose answer decides a flagged risk (derive.ts, risks).
function riskKeys(
  type: string,
  values: KeyValueView[]
): Record<string, Risk['kind']> {
  if (type === 'foundation') {
    const foundationType = valueOf(values, 'foundation_type')
    const rule =
      typeof foundationType === 'string'
        ? RISK_FOUNDATIONS[foundationType]
        : undefined
    return {
      foundation_type: 'risk_construction',
      ...(rule && { [rule[0]]: 'risk_construction' as const }),
    }
  }
  if (type === 'electrical_installation') return { wiring: 'older_electrical' }
  if (type === 'electrical_panel') return { rcd: 'older_electrical' }
  return {}
}

export function openQuestions(input: QuestionInput): OpenQuestions {
  const { components, houseValues, library, attributes } = input
  const { startYear, workItems } = input.forecast
  const evaluate = (list: ComponentView[], values: KeyValueView[]) => {
    const plans = planComponents(list, values, library, startYear)
    const forecast = computeForecast({ ...input.forecast, plans })
    const effect: Effect = {
      maintenanceDebtSek: maintenanceDebt(plans, workItems, startYear).total
        .typical,
      forecastSek: forecast.total.typical,
    }
    return { plans, forecast, effect }
  }
  const { plans, forecast, effect: now } = evaluate(components, houseValues)
  const planOf = new Map(plans.map((p) => [p.componentId, p]))
  const documented = flatten(components)
  const constructionYear = valueOf(houseValues, 'construction_year')
  const questions: Bare[] = []

  type Target = Pick<Question, 'componentId' | 'type' | 'name' | 'documented'>

  // Tries every answer for one input that is missing or uncertain, and
  // keeps the question when an answer moves a total or decides a risk.
  const ask = (
    target: Target,
    values: KeyValueView[],
    key: string,
    options: Answer[],
    extra: Pick<Question, 'decides' | 'usedNow'> = {}
  ) => {
    const current = values.find((v) => v.key === key)?.current
    const uncertain =
      !!current && current.confidence !== null && current.confidence < CONFIDENT
    if (current && !uncertain) return
    const answers = options.map((value) => {
      const { effect } =
        target.componentId === null
          ? evaluate(components, withValue(houseValues, key, value))
          : evaluate(
              withAnswer(
                components,
                { componentId: target.componentId, type: target.type },
                key,
                value
              ),
              houseValues
            )
      return { value, ...effect }
    })
    const swing = {
      maintenanceDebtSek: spread(answers.map((a) => a.maintenanceDebtSek)),
      forecastSek: spread(answers.map((a) => a.forecastSek)),
    }
    if (!extra.decides && swing.maintenanceDebtSek < 1 && swing.forecastSek < 1)
      return
    questions.push({
      ...target,
      key,
      why: uncertain ? 'uncertain' : 'missing',
      now: uncertain
        ? { value: current.value, confidence: current.confidence }
        : undefined,
      ...extra,
      usedNow: uncertain ? undefined : extra.usedNow,
      answers,
      swing,
    })
  }

  // Documented parts, assumed parts, and parts other parts read as context
  // or that decide a risk, such as the foundation, even when no document
  // mentions them.
  const targets: (Target & { values: KeyValueView[]; plan?: ComponentPlan })[] =
    [
      ...documented.map((c) => ({
        componentId: c.id,
        type: c.type,
        name: c.name,
        documented: true,
        values: c.values,
        plan: planOf.get(c.id),
      })),
      ...plans
        .filter((p) => p.assumed)
        .map((p) => ({
          componentId: p.componentId,
          type: p.type,
          name: null,
          documented: false,
          values: [],
          plan: p,
        })),
    ]
  const contextTypes = new Set([
    'foundation',
    ...[...library.defaults.values()].flatMap((d) =>
      Object.values(d.context ?? {})
    ),
  ])
  for (const type of contextTypes)
    if (!targets.some((t) => t.type === type))
      targets.push({
        componentId: ASSUMED_PREFIX + type,
        type,
        name: null,
        documented: false,
        values: [],
      })

  for (const { values, plan, ...target } of targets) {
    const risk = riskKeys(target.type, values)
    for (const [key, def] of Object.entries(attributes.get(target.type) ?? {}))
      if (def.datatype === 'choice')
        ask(target, values, key, Object.keys(def.options), {
          decides: risk[key],
        })
      else if (def.datatype === 'boolean')
        ask(target, values, key, [true, false], { decides: risk[key] })
    if (!plan) continue

    const oldest =
      typeof constructionYear === 'number'
        ? constructionYear
        : startYear - plan.fullLifespan.low
    ask(
      target,
      values,
      'installation_year',
      years(
        oldest,
        startYear - Math.round(plan.fullLifespan.typical / 2),
        startYear
      ),
      { usedNow: plan.installYear.typical }
    )
    ask(target, values, 'condition', CONDITIONS)
    if (plan.repaint)
      ask(
        target,
        values,
        'last_painted_year',
        years(
          plan.installYear.typical,
          startYear - Math.round(plan.repaint.interval.typical / 2),
          startYear
        ),
        { usedNow: plan.repaint.lastPainted.typical }
      )
    const estimate = plan.flags.find(askQuantity)
    if (estimate)
      questions.push({
        ...target,
        key: String(estimate.params?.key ?? 'quantity'),
        why: estimate.code === 'quantity_missing' ? 'missing' : 'estimated',
        answers: [],
        swing: null,
      })
  }

  // The house itself.
  const house: Target = {
    componentId: null,
    type: 'house',
    name: null,
    documented: true,
  }
  ask(house, houseValues, 'floor_count', FLOOR_ANSWERS)
  for (const key of CORE_HOUSE_KEYS)
    if (valueOf(houseValues, key) === undefined)
      questions.push({
        ...house,
        key,
        why: 'missing',
        answers: [],
        swing: null,
      })
  // Known not to be measured is an answer: what remains is a measurement
  // to order, not a question.
  if (
    valueOf(houseValues, 'radon_bq_m3') === undefined &&
    valueOf(houseValues, 'radon_measured') !== false
  )
    questions.push({
      ...house,
      key: 'radon_bq_m3',
      why: 'missing',
      answers: [],
      swing: null,
      decides: 'radon',
    })

  // Running costs: an estimated or uncertain line by its range over the
  // horizon, and none at all as unknown.
  const running = forecast.items.filter((i) => i.category === 'running')
  for (const item of running) {
    const width = item.total.high - item.total.low
    if (width < 1) continue
    const estimated = HEATING_ESTIMATES.includes(item.key)
    questions.push({
      ...house,
      // A heating cost worked out from energy is settled by the cost itself.
      key: estimated ? 'heating_cost_sek_per_year' : item.key,
      why: estimated ? 'estimated' : 'uncertain',
      answers: [],
      swing: { maintenanceDebtSek: 0, forecastSek: width },
    })
  }
  if (!running.length)
    questions.push({
      ...house,
      key: 'operating_cost_sek_per_year',
      why: 'missing',
      answers: [],
      swing: null,
    })

  // Work items without a cost count as zero.
  const typeOf = new Map(documented.map((c) => [c.id, c]))
  for (const w of workItems)
    if (!workItemCost(w)) {
      const c = w.componentId ? typeOf.get(w.componentId) : undefined
      questions.push({
        componentId: c?.id ?? null,
        type: c?.type ?? 'house',
        name: w.description,
        documented: true,
        key: 'cost',
        why: 'no_cost',
        answers: [],
        swing: null,
        workItemId: w.id,
      })
    }

  // Largest effect first, by the larger of the two totals; then the ones
  // that decide a risk, then the rest.
  const weight = (q: Bare) =>
    q.swing
      ? Math.max(q.swing.maintenanceDebtSek, q.swing.forecastSek)
      : q.decides
        ? -1
        : -2
  questions.sort((a, b) => weight(b) - weight(a))
  const form = formOf({
    attributes,
    startYear,
    constructionYear:
      typeof constructionYear === 'number' ? constructionYear : undefined,
  })
  return {
    now,
    inspected: !!input.forecast.inspected,
    questions: questions.map((q) => ({
      id: q.workItemId
        ? `work_item:${q.workItemId}`
        : `${q.componentId ?? 'house'}:${q.key}`,
      ...form(q),
      ...q,
    })),
  }
}

const spread = (values: number[]) =>
  values.length ? Math.max(...values) - Math.min(...values) : 0

// Spans of years ago a buyer is told: "about five years ago", "when we
// moved in". The value is the middle of the span, with a confidence that
// says it is approximate but enough to settle the question.
const INSTALLED_AGO = [
  [0, 5],
  [5, 15],
  [15, 30],
]
const PAINTED_AGO = [
  [0, 3],
  [3, 8],
  [8, 15],
]
const APPROXIMATE = CONFIDENT
// Seen at the house, or a grade judged by eye.
const SEEN = 0.9
const JUDGED = 0.8

const CONDITION_LABELS: Record<number, string> = {
  1: 'needs replacing now',
  2: 'worn',
  3: 'normal wear',
  4: 'good',
  5: 'as new',
}

// Keys the agent or seller answers rather than the eye.
const ASKED = new Set([
  'installation_year',
  'last_painted_year',
  'radon_bq_m3',
  'construction_year',
  'living_area',
  'area',
  'length',
  'cost',
])

function formOf({
  attributes,
  startYear,
  constructionYear,
}: {
  attributes: QuestionInput['attributes']
  startYear: number
  constructionYear: number | undefined
}) {
  // The original part, then spans of years ago that fall after it.
  const yearOptions = (
    spans: number[][],
    floor: number | undefined,
    original: string
  ): QuestionOption[] => [
    ...(floor === undefined
      ? []
      : [
          {
            value: floor,
            confidence: APPROXIMATE,
            label: `${original} (${floor})`,
            meaning: { kind: 'original' as const, year: floor },
          },
        ]),
    ...spans
      .map(([from, to]) => ({
        value: startYear - Math.round((from + to) / 2),
        confidence: APPROXIMATE,
        label: `${from}–${to} years ago`,
        meaning: { kind: 'years_ago' as const, from, to },
      }))
      .filter((o) => floor === undefined || o.value > floor),
  ]
  const year: ManualInput = { datatype: 'year', min: 1800, max: startYear }

  return (q: Bare): Pick<Question, 'how' | 'options' | 'manual'> => {
    const how: Question['how'] =
      ASKED.has(q.key) || q.key.endsWith('_per_year') ? 'ask' : 'look'
    const form = (options: QuestionOption[], manual: ManualInput | null) => ({
      how,
      options,
      manual,
    })
    if (q.workItemId)
      return form([], { datatype: 'number', unit: 'SEK', min: 0 })
    const def =
      q.componentId === null ? undefined : attributes.get(q.type)?.[q.key]
    if (def?.datatype === 'choice')
      return form(
        Object.entries(def.options).map(([value, label]) => ({
          value,
          confidence: SEEN,
          label: label.en ?? label.sv,
          meaning: { kind: 'choice' },
        })),
        null
      )
    if (def?.datatype === 'boolean')
      return form(
        [true, false].map((value) => ({
          value,
          confidence: SEEN,
          label: value ? 'yes' : 'no',
          meaning: { kind: 'boolean' },
        })),
        null
      )
    switch (q.key) {
      case 'installation_year':
        return form(
          yearOptions(INSTALLED_AGO, constructionYear, 'original'),
          year
        )
      case 'last_painted_year':
        return form(
          yearOptions(PAINTED_AGO, q.usedNow, 'not since installed'),
          year
        )
      case 'condition':
        return form(
          [5, 4, 3, 2, 1].map((value) => ({
            value,
            confidence: JUDGED,
            label: `${value}: ${CONDITION_LABELS[value]}`,
            meaning: { kind: 'condition' },
          })),
          null
        )
      case 'floor_count':
        return form(
          FLOOR_ANSWERS.map((value) => ({
            value,
            confidence: 1,
            label: String(value),
            meaning: { kind: 'number' },
          })),
          { datatype: 'number', min: 1, max: 4 }
        )
      case 'quantity':
        return form([], { datatype: 'number', min: 1 })
      case 'area':
        return form([], { datatype: 'number', unit: 'm2', min: 0 })
      case 'length':
        return form([], { datatype: 'number', unit: 'm', min: 0 })
      case 'radon_bq_m3':
        return form(
          [
            {
              value: false,
              key: 'radon_measured',
              confidence: 1,
              label: 'not measured',
              meaning: { kind: 'not_measured' },
            },
          ],
          { datatype: 'number', unit: 'Bq/m3', min: 0 }
        )
    }
    const houseKey = q.componentId === null ? HOUSE_KEYS[q.key] : undefined
    if (houseKey?.datatype === 'year') return form([], year)
    return form([], { datatype: 'number', unit: houseKey?.unit, min: 0 })
  }
}
