import { describe, expect, it } from 'vitest'
import { componentTypes } from '../../../prisma/data/componentTypes.mts'
import en from '../../../messages/en.json'
import sv from '../../../messages/sv.json'
import {
  checkValue,
  fromAttribute,
  fromHouseKey,
} from '@/server/library/checkValue'
import { HOUSE_KEYS } from '@/server/library/houseKeys'
import { componentTypeSchema } from '@/server/library/schema'
import {
  DEMO_DOCUMENTS,
  DEMO_LOG,
  DEMO_FORECASTS,
  DEMO_OBSERVATIONS,
  DEMO_WORK_ITEMS,
} from './demoHouse'

const types = new Map(
  componentTypes.map((t) => {
    const parsed = componentTypeSchema.parse(t)
    return [parsed.type, parsed]
  })
)
const refs = {
  documents: new Set<string>(DEMO_DOCUMENTS.map((d) => d.id)),
  components: new Set(DEMO_OBSERVATIONS.parts.map((p) => p.id)),
}
const now = new Date('2026-11-09T12:00:00Z')

// The demo shows what Husvan stores, so every value has to be one the server
// would accept from Claude (proposeChanges validates the same way).
describe('the demo house', () => {
  it('uses house keys the library knows, with valid values', () => {
    for (const o of DEMO_OBSERVATIONS.house) {
      const def = HOUSE_KEYS[o.key]
      expect(def, o.key).toBeDefined()
      expect(
        checkValue(fromHouseKey(def), o.value, o.unit, refs, now),
        o.key
      ).toBeNull()
    }
  })

  it('uses component types and attributes from the library', () => {
    for (const part of DEMO_OBSERVATIONS.parts) {
      const type = types.get(part.type)
      expect(type, part.type).toBeDefined()
      for (const o of part.values) {
        const def = type!.attributeSchema[o.key]
        expect(def, `${part.type}.${o.key}`).toBeDefined()
        expect(
          checkValue(fromAttribute(def), o.value, o.unit, refs, now),
          `${part.type}.${o.key}`
        ).toBeNull()
      }
      for (const child of part.children ?? [])
        expect(type!.allowedSubcomponents, child.type).toContain(child.type)
    }
  })

  it('points work items at parts of the house', () => {
    for (const w of DEMO_WORK_ITEMS) {
      expect(refs.components, w.id).toContain(w.component)
      expect(w.yearMin).toBeLessThanOrEqual(w.yearMax)
      expect(w.costLowSek).toBeLessThanOrEqual(w.costHighSek)
    }
  })

  it.each([
    ['sv', sv],
    ['en', en],
  ])('has a text for every log entry and forecast in %s', (_, messages) => {
    const log: Record<string, string> = messages.demo.log.entries
    expect(Object.keys(log).sort()).toEqual(
      [...new Set(DEMO_LOG.map((c) => c.entry))].sort()
    )
    const forecasts: Record<string, string> = messages.demo.forecasts.entries
    expect(Object.keys(forecasts).sort()).toEqual(
      DEMO_FORECASTS.map((f) => f.entry).sort()
    )
  })
})
