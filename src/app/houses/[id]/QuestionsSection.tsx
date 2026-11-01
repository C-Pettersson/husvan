'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Collapse,
  InputAdornment,
  LinearProgress,
  Paper,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import CheckCircle from '@mui/icons-material/CheckCircle'
import Undo from '@mui/icons-material/Undo'
import ExpandMore from '@mui/icons-material/ExpandMore'
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined'
import { formatSek, formatSekShort, numberFormat } from '@/lib/format'
import { useLabels } from '@/lib/labels'
import { trpc } from '@/lib/trpc'
import type {
  Answer,
  ManualInput,
  Question,
  QuestionOption,
} from '@/server/forecast/questions'

// Questions with a kronor figure or a risk come first; the rest wait
// behind "more".
const important = (q: Question) => q.swing !== null || q.decides !== undefined

// Rows shown before "more", so the list stays short on a phone.
const FIRST_ROWS = 6

const UNITS: Record<string, string> = {
  SEK: 'kr',
  m2: 'm²',
  'Bq/m3': 'Bq/m³',
}

// A list that survives a reload at the viewing, on this device only. The
// list renders only after the questions load in the browser, so the
// server's empty start never shows.
function useStoredList<T>(storageKey: string) {
  const [list, setList] = useState<T[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    } catch {
      return []
    }
  })
  const save = (next: T[]) => {
    setList(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // Private window or blocked storage: the list lasts until reload.
    }
  }
  return [list, save] as const
}

// An answer given here, with the change it made, so that it can be undone.
type Given = {
  id: string
  part: string
  title: string
  answer: string
  changesetId: string
}

// What the analysis does not know yet, as a checklist for the viewing
// (CLAUDE.md, "Öppna frågor"): one short row per question, and one row open
// at a time with quick options and a field for any other value, like a
// field survey. An answer is the user's own value, approved at once; the
// house is worked out again and the next question opens.
export default function QuestionsSection({ houseId }: { houseId: string }) {
  const t = useTranslations('questions')
  const questions = trpc.house.questions.useQuery({ id: houseId })
  const [how, setHow] = useState<Question['how']>('look')
  const [more, setMore] = useState(false)
  // The open row; undefined opens the first one.
  const [openId, setOpenId] = useState<string | null | undefined>()
  const [answered, setAnswered] = useStoredList<Given>(
    `husvan.answered.${houseId}`
  )
  const [skipped, setSkipped] = useStoredList<string>(
    `husvan.skipped.${houseId}`
  )
  // The answer just given, offered for undoing until the next one.
  const [last, setLast] = useState<Given | null>(null)
  const labels = useLabels(questions.data?.types ?? {})
  const text = useQuestionText(labels)
  const utils = trpc.useUtils()
  const undo = trpc.house.undoAnswer.useMutation()
  const takeBack = (given: Given) =>
    undo.mutate(
      { houseId, changesetId: given.changesetId },
      {
        onSuccess: async () => {
          setAnswered(
            answered.filter((a) => a.changesetId !== given.changesetId)
          )
          setLast(null)
          await utils.house.invalidate()
          setOpenId(given.id)
        },
      }
    )

  if (questions.isPending) return <CircularProgress size={24} />
  if (questions.isError)
    return <Alert severity="error">{t('loadFailed')}</Alert>

  const data = questions.data
  const all = data.questions as Question[]
  const open = all.filter((q) => !skipped.includes(q.id))
  const ofHow = open.filter((q) => q.how === how)
  const ranked = [
    ...ofHow.filter(important),
    ...ofHow.filter((q) => !important(q)),
  ]
  const first = ranked.slice(0, FIRST_ROWS)
  const rest = ranked.slice(FIRST_ROWS)
  const count = (h: Question['how']) => open.filter((q) => q.how === h).length
  const total = answered.length + all.filter(important).length
  const visible = more ? [...first, ...rest] : first
  const current =
    openId === undefined
      ? visible[0]?.id
      : visible.some((q) => q.id === openId)
        ? openId
        : null
  // The question after this one in the list, opened when this one is done.
  const next = (q: Question) =>
    visible[visible.findIndex((x) => x.id === q.id) + 1]?.id ?? null
  const rows = (list: Question[]) => (
    <Paper variant="outlined">
      {list.map((q, i) => (
        <QuestionRow
          key={q.id}
          houseId={houseId}
          q={q}
          text={text}
          horizonYears={data.horizonYears}
          divider={i > 0}
          open={current === q.id}
          onToggle={() => setOpenId(current === q.id ? null : q.id)}
          onAnswered={(answer, changesetId) => {
            const given = {
              id: q.id,
              part: text.part(q),
              title: text.title(q),
              answer,
              changesetId,
            }
            setAnswered([...answered, given])
            setLast(given)
            setOpenId(next(q))
          }}
          onSkip={() => {
            setOpenId(next(q))
            setSkipped([...skipped, q.id])
          }}
        />
      ))}
    </Paper>
  )

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        {t('intro')}
      </Typography>
      {!data.inspected && (
        <Alert severity="info" sx={{ py: 0 }}>
          {t('notInspected')}
        </Alert>
      )}

      {total > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary">
            {t('progress', { answered: answered.length, total })}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={(answered.length / total) * 100}
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>
      )}

      <ToggleButtonGroup
        value={how}
        exclusive
        fullWidth
        size="small"
        onChange={(_, v) => {
          if (!v) return
          setHow(v)
          setOpenId(undefined)
        }}
        aria-label={t('howLabel')}
      >
        <ToggleButton value="look" title={t('lookHelp')}>
          {t('look', { count: count('look') })}
        </ToggleButton>
        <ToggleButton value="ask" title={t('askHelp')}>
          {t('ask', { count: count('ask') })}
        </ToggleButton>
      </ToggleButtonGroup>

      {first.length === 0 && rest.length === 0 && (
        <Typography variant="body2">{t('none')}</Typography>
      )}
      {first.length > 0 && rows(first)}
      {rest.length > 0 && (
        <>
          <Button
            size="small"
            onClick={() => setMore(!more)}
            sx={{ alignSelf: 'flex-start' }}
          >
            {more ? t('fewer') : t('more', { count: rest.length })}
          </Button>
          <Collapse in={more} unmountOnExit>
            {rows(rest)}
          </Collapse>
        </>
      )}

      {undo.isError && (
        <Alert severity="error">
          {undo.error.data?.code === 'CONFLICT'
            ? t('undoDependedOn')
            : t('undoFailed')}
        </Alert>
      )}

      {answered.length > 0 && (
        <Stack spacing={1}>
          <Typography variant="subtitle2">{t('answeredTitle')}</Typography>
          {[...answered].reverse().map((a) => (
            <Stack
              key={a.changesetId}
              direction="row"
              spacing={1}
              alignItems="center"
            >
              <CheckCircle color="success" fontSize="small" />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600}>
                  {a.part}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {a.title} <strong>{a.answer}</strong>
                </Typography>
              </Box>
              <Button
                size="small"
                startIcon={<Undo />}
                disabled={undo.isPending}
                onClick={() => takeBack(a)}
              >
                {t('undo')}
              </Button>
            </Stack>
          ))}
        </Stack>
      )}

      <Snackbar
        open={last !== null}
        autoHideDuration={8000}
        onClose={(_, reason) => reason !== 'clickaway' && setLast(null)}
        message={last && t('saved', { answer: last.answer })}
        action={
          last && (
            <Button
              color="inherit"
              size="small"
              disabled={undo.isPending}
              onClick={() => takeBack(last)}
            >
              {t('undo')}
            </Button>
          )
        }
      />

      {skipped.some((id) => all.some((q) => q.id === id)) && (
        <Stack spacing={1}>
          <Typography variant="subtitle2">{t('skippedTitle')}</Typography>
          {all
            .filter((q) => skipped.includes(q.id))
            .map((q) => (
              <Stack key={q.id} direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" color="text.secondary">
                  {text.part(q)}: {text.title(q)}
                </Typography>
                <Button
                  size="small"
                  onClick={() => setSkipped(skipped.filter((x) => x !== q.id))}
                >
                  {t('restore')}
                </Button>
              </Stack>
            ))}
        </Stack>
      )}
    </Stack>
  )
}

type Text = ReturnType<typeof useQuestionText>

// The wording of a question, its status and its options in the reader's
// language.
function useQuestionText(labels: ReturnType<typeof useLabels>) {
  const t = useTranslations('questions')
  const tAll = useTranslations()
  const locale = useLocale()
  const typeOf = (q: Question) => (q.type === 'house' ? undefined : q.type)
  const keyLabel = (q: Question) => labels.attributeLabel(q.key, typeOf(q))

  return {
    part: (q: Question) => {
      if (q.workItemId) return t('workItem')
      const part = q.type === 'house' ? t('house') : labels.typeLabel(q.type)
      if (!q.name) return part
      // "Dränering, omdränerad 2021" already says it is the drainage.
      return q.name.toLowerCase().startsWith(part.toLowerCase())
        ? q.name
        : `${part} · ${q.name}`
    },
    title: (q: Question) => {
      if (q.workItemId) return q.name ?? t('title.cost')
      const specific = `title.${q.type}.${q.key}`
      if (t.has(specific)) return t(specific)
      if (t.has(`title.${q.key}`)) return t(`title.${q.key}`)
      return t('title.other', { label: keyLabel(q) })
    },
    status: (q: Question) => {
      if (q.why === 'uncertain' && q.now)
        return t('status.uncertain', {
          value: labels.valueText(q.key, q.now.value, typeOf(q)),
        })
      if (q.why === 'no_cost') return t('status.noCost')
      if (q.why === 'estimated')
        return t(q.key === 'quantity' ? 'status.counted' : 'status.estimated')
      if (q.key === 'condition') return t('status.conditionAssumed')
      if (q.key === 'installation_year' && q.usedNow !== undefined)
        return t('status.installedAssumed', { year: String(q.usedNow) })
      if (q.key === 'last_painted_year' && q.usedNow !== undefined)
        return t('status.paintedAssumed', { year: String(q.usedNow) })
      return t('status.missing')
    },
    hint: (q: Question) => {
      const key = `hint.${q.type}.${q.key}`
      if (t.has(key)) return t(key)
      return t.has(`hint.${q.key}`) ? t(`hint.${q.key}`) : null
    },
    option: (q: Question, o: QuestionOption) => {
      const m = o.meaning
      switch (m.kind) {
        case 'choice':
          return labels.valueText(q.key, o.value, typeOf(q))
        case 'boolean':
          return tAll(o.value ? 'value.yes' : 'value.no')
        case 'condition':
          return t(`condition.${o.value}`)
        case 'original':
          return q.key === 'last_painted_year'
            ? t('notSince', { year: String(m.year) })
            : t('original', { year: String(m.year) })
        case 'years_ago':
          return m.from === 0
            ? t('lastYears', { to: m.to })
            : t('yearsAgo', { from: m.from, to: m.to })
        case 'not_measured':
          return t('notMeasured')
        default:
          return numberFormat(locale).format(o.value as number)
      }
    },
    manual: (q: Question, value: number) =>
      q.manual?.unit === 'SEK'
        ? formatSek(value, locale)
        : q.manual?.datatype === 'year'
          ? String(value)
          : `${numberFormat(locale).format(value)}${q.manual?.unit ? ` ${UNITS[q.manual.unit] ?? q.manual.unit}` : ''}`,
    impact: (q: Question, horizonYears: number) => {
      if (!q.swing) return null
      const { maintenanceDebtSek: debt, forecastSek: forecast } = q.swing
      return {
        short: t('impact', {
          sek: formatSekShort(Math.max(debt, forecast), locale),
        }),
        long: [
          debt >= 1 && t('impactDebt', { sek: formatSekShort(debt, locale) }),
          forecast >= 1 &&
            t('impactForecast', {
              sek: formatSekShort(forecast, locale),
              years: horizonYears,
            }),
        ]
          .filter(Boolean)
          .join(' '),
      }
    },
  }
}

// One question: a short row that says what is asked and what it is worth,
// and, when open, how to answer it.
function QuestionRow({
  houseId,
  q,
  text,
  horizonYears,
  divider,
  open,
  onToggle,
  onAnswered,
  onSkip,
}: {
  houseId: string
  q: Question
  text: Text
  horizonYears: number
  divider: boolean
  open: boolean
  onToggle: () => void
  onAnswered: (answer: string, changesetId: string) => void
  onSkip: () => void
}) {
  const t = useTranslations('questions')
  const tRisk = useTranslations('risk')
  const utils = trpc.useUtils()
  const [manualOpen, setManualOpen] = useState(q.options.length === 0)
  const [typed, setTyped] = useState('')
  const [chosen, setChosen] = useState<Answer | null>(null)
  const answer = trpc.house.answerQuestion.useMutation({
    onSuccess: () => utils.house.invalidate(),
  })
  const impact = text.impact(q, horizonYears)
  const hint = text.hint(q)

  const send = (value: Answer, shown: string) => {
    setChosen(value)
    answer.mutate(
      { houseId, answer: { questionId: q.id, value } },
      { onSuccess: (r) => onAnswered(shown, r.changesetId) }
    )
  }
  const parsed = parseManual(q.manual, typed)

  return (
    <Box sx={divider ? { borderTop: 1, borderColor: 'divider' } : undefined}>
      <ButtonBase
        onClick={onToggle}
        aria-expanded={open}
        sx={{
          width: '100%',
          px: 2,
          py: 1.25,
          gap: 1.5,
          justifyContent: 'flex-start',
          textAlign: 'left',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body1" fontWeight={600} component="h3">
            {text.part(q)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {text.title(q)}
          </Typography>
        </Box>
        {impact ? (
          <Tooltip title={impact.long}>
            <Typography
              variant="body2"
              fontWeight={600}
              color="primary"
              sx={{ whiteSpace: 'nowrap' }}
            >
              {impact.short}
            </Typography>
          </Tooltip>
        ) : (
          q.decides && <WarningAmberOutlined color="warning" fontSize="small" />
        )}
        <ExpandMore
          fontSize="small"
          sx={{
            color: 'text.secondary',
            transform: open ? 'rotate(180deg)' : undefined,
            transition: 'transform 150ms',
          }}
        />
      </ButtonBase>
      <Collapse in={open} unmountOnExit>
        <Stack spacing={1} sx={{ px: 2, pb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {text.status(q)}
            {!q.documented && ` ${t('status.notDocumented')}`}
          </Typography>
          {hint && <Typography variant="body2">{hint}</Typography>}
          {q.decides && (
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              label={t('decides', { risk: tRisk(q.decides) })}
              sx={{ alignSelf: 'flex-start' }}
            />
          )}

          {q.options.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, pt: 0.5 }}>
              {q.options.map((o) => {
                const label = text.option(q, o)
                const pending = answer.isPending && chosen === o.value
                return (
                  <Button
                    key={String(o.value)}
                    variant="outlined"
                    disabled={answer.isPending}
                    onClick={() => send(o.value, label)}
                    sx={{ minHeight: 44, textTransform: 'none' }}
                    startIcon={
                      pending ? <CircularProgress size={16} /> : undefined
                    }
                  >
                    {label}
                  </Button>
                )
              })}
            </Box>
          )}

          {q.manual && (
            <Collapse in={manualOpen}>
              <Stack direction="row" spacing={1} sx={{ pt: 0.5 }}>
                <TextField
                  size="small"
                  label={t(q.manual.datatype === 'year' ? 'year' : 'value')}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  error={typed.trim() !== '' && parsed === null}
                  slotProps={{
                    htmlInput: { inputMode: 'decimal' },
                    input: {
                      endAdornment: q.manual.unit ? (
                        <InputAdornment position="end">
                          {UNITS[q.manual.unit] ?? q.manual.unit}
                        </InputAdornment>
                      ) : undefined,
                    },
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && parsed !== null)
                      send(parsed, text.manual(q, parsed))
                  }}
                  sx={{ flex: 1, maxWidth: 240 }}
                />
                <Button
                  variant="contained"
                  disabled={parsed === null || answer.isPending}
                  onClick={() =>
                    parsed !== null && send(parsed, text.manual(q, parsed))
                  }
                >
                  {t('save')}
                </Button>
              </Stack>
            </Collapse>
          )}

          {answer.isError && (
            <Alert severity="error" sx={{ whiteSpace: 'pre-line' }}>
              {t('failed')} {answer.error.message}
            </Alert>
          )}

          <Stack direction="row" spacing={1}>
            {q.manual && q.options.length > 0 && !manualOpen && (
              <Button size="small" onClick={() => setManualOpen(true)}>
                {t(q.manual.datatype === 'year' ? 'otherYear' : 'otherValue')}
              </Button>
            )}
            <Button size="small" color="inherit" onClick={onSkip}>
              {t('skip')}
            </Button>
          </Stack>
        </Stack>
      </Collapse>
    </Box>
  )
}

// A typed number or year within the input's bounds, else null.
function parseManual(manual: ManualInput | null, typed: string) {
  if (!manual || typed.trim() === '') return null
  const n = Number(typed.trim().replace(',', '.').replace(/\s/g, ''))
  if (!Number.isFinite(n)) return null
  if (manual.datatype === 'year' && !Number.isInteger(n)) return null
  if (manual.min !== undefined && n < manual.min) return null
  if (manual.max !== undefined && n > manual.max) return null
  return n
}
