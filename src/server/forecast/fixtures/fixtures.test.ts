// @vitest-environment node
// The four local houses as fixtures (CLAUDE.md, "Hur prognosen är byggd"):
// the rules for parts of other buildings, the earliest year per type and
// the totals the figures land on, so that a change in a rule or a profile
// shows here before it shows in production.
import { describe, expect, it } from 'vitest'
import type { ComponentView } from '@/server/houses/getHouse'
import { houseWarnings, type CheckLibrary } from '@/server/houses/checks'
import { maintenanceDebt } from '../debt'
import { flagText } from '../flags'
import { computeForecast } from '../forecast'
import { planComponents } from '../plan'
import { FIXTURES, fixtureLibrary, loadFixture, type FixtureName } from './load'

const START = 2026

function analyse(name: FixtureName, components?: ComponentView[]) {
  const fixture = loadFixture(name)
  const library = fixtureLibrary(fixture, START)
  const list = components ?? fixture.house.components
  const plans = planComponents(list, fixture.house.values, library, START)
  const inspected = fixture.house.documents.some((d) => d.type === 'INSPECTION')
  const forecast = computeForecast({
    startYear: START,
    horizonYears: 15,
    plans,
    workItems: fixture.house.workItems,
    running: [],
    trend: null,
    capital: null,
    inspected,
  })
  const debt = maintenanceDebt(plans, fixture.house.workItems, START)
  const checks: CheckLibrary = {
    attributes: new Map(
      Object.entries(fixture.house.types).map(([t, d]) => [
        t,
        new Set(Object.keys(d.attributeSchema)),
      ])
    ),
    earliestYear: new Map(
      [...library.defaults].flatMap(([t, d]) =>
        d.earliestYear ? [[t, d.earliestYear] as [string, number]] : []
      )
    ),
  }
  const warnings = houseWarnings(
    { values: fixture.house.values, components: list },
    checks
  )
  return { fixture, library, plans, forecast, debt, warnings }
}

type Plans = ReturnType<typeof analyse>['plans']
const byName = (plans: Plans, name: string) =>
  plans.find((p) => p.name === name)!

describe('Yxgränd 6: the garage roof at top level', () => {
  it('is warned about and priced as the house’s roof while it sits there', () => {
    const { plans, warnings } = analyse('yxgrand-6')
    const garageRoof = byName(plans, 'Tak, garage')
    const houseRoof = byName(plans, 'Sadeltak, bostadshus')
    // Both share the house's estimated roof area of 1.3 × 121 m2.
    expect(garageRoof.quantity).toBeCloseTo(houseRoof.quantity!)
    expect(garageRoof.quantity).toBeCloseTo((1.3 * 121) / 2)
    expect(garageRoof.flags.map((f) => f.code)).toContain(
      'looks_like_other_building'
    )
    expect(
      warnings.filter((w) => w.code === 'separate_building_part_at_top_level')
    ).toHaveLength(2)
    expect(warnings.map((w) => w.text).join('\n')).toContain('"Tak, garage"')
  })

  it('is priced on the garage’s own area once moved under the garage', () => {
    const { fixture } = analyse('yxgrand-6')
    const roof = fixture.house.components.find((c) => c.name === 'Tak, garage')!
    const garage = fixture.house.components.find((c) => c.type === 'garage')!
    const withArea = (c: ComponentView, area: number): ComponentView => ({
      ...c,
      values: [
        ...c.values,
        {
          key: 'area',
          current: { ...c.values[0].current, key: 'area', value: area },
          alternatives: [],
        },
      ],
    })
    const under = (child: ComponentView) =>
      fixture.house.components
        .filter((c) => c !== roof)
        .map((c) =>
          c === garage ? { ...c, children: [...c.children, child] } : c
        )
    const { plans, warnings } = analyse('yxgrand-6', under(withArea(roof, 40)))
    const garageRoof = byName(plans, 'Tak, garage')
    const houseRoof = byName(plans, 'Sadeltak, bostadshus')
    expect(garageRoof.quantity).toBe(40)
    expect(garageRoof.flags.map((f) => f.code)).not.toContain(
      'looks_like_other_building'
    )
    // The house's roof now has the whole estimate to itself.
    expect(houseRoof.quantity).toBeCloseTo(1.3 * 121)
    expect(
      warnings.filter((w) => w.code === 'separate_building_part_at_top_level')
    ).toHaveLength(1)
    // Without an area the garage roof costs nothing instead of the house's
    // share.
    const bare = analyse('yxgrand-6', under(roof))
    expect(byName(bare.plans, 'Tak, garage').cost).toBeNull()
  })

  it('assumes the sewer under the slab and no radiators beside water floor heating', () => {
    const { plans } = analyse('yxgrand-6')
    expect(
      plans.find(
        (p) => p.componentId === 'assumed:sewer_pipes:section=under_slab'
      )
    ).toMatchObject({ assumed: true, profile: { section: 'under_slab' } })
    expect(plans.some((p) => p.type === 'hydronic_radiators')).toBe(false)
  })
})

describe('all four houses', () => {
  it('give no part an installation year before its type existed', () => {
    for (const name of FIXTURES) {
      const { plans, library } = analyse(name)
      for (const p of plans) {
        const earliest = library.defaults.get(p.type)?.earliestYear
        if (earliest !== undefined)
          expect(
            p.installYear.typical,
            `${name} ${p.type}`
          ).toBeGreaterThanOrEqual(earliest)
      }
    }
  })

  it('assume radiators for district heating without water floor heating', () => {
    const radiators = (name: FixtureName) =>
      analyse(name).plans.some(
        (p) => p.type === 'hydronic_radiators' && p.assumed
      )
    expect(radiators('mjardgatan-1')).toBe(true)
    // Electric floor heating in the hall is not the distribution.
    expect(radiators('bredviksvagen-15')).toBe(true)
    // Water floor heating at top level is.
    expect(radiators('ytterviksvagen-30a')).toBe(false)
  })

  it('take the basement into the footprint', () => {
    const { plans } = analyse('bredviksvagen-15')
    const roof = byName(plans, 'Plåttak, bostadshus')
    // (94 + 90) m2 over 2 floors, 1.3 times, shared with the garage roof.
    expect(roof.quantity).toBeCloseTo((1.3 * 92) / 2)
    expect(roof.flags.map((f) => f.code)).toContain(
      'footprint_includes_secondary_area'
    )
  })

  it('count a finding without severity as seen, with a flag', () => {
    // Mjärdgatan's protocol has findings without severity.
    const { forecast, fixture } = analyse('mjardgatan-1')
    const flagged = forecast.items
      .filter((i) => i.flags.some((f) => f.code === 'finding_without_severity'))
      .map((i) => i.componentId)
    const onParts = [
      ...new Set(
        fixture.house.workItems
          .filter((w) => w.severity === null && w.componentId)
          .map((w) => w.componentId!)
      ),
    ].filter((id) => forecast.items.some((i) => i.componentId === id))
    expect(flagged.length).toBeGreaterThan(0)
    expect(flagged.sort()).toEqual(onParts.sort())
  })

  // The figures the rules land on, typical scenario, parts only (no running
  // costs). A change here is a change in a rule or a profile: check it is
  // meant before updating.
  it.each([
    ['yxgrand-6', 1951143, 1479802],
    ['mjardgatan-1', 1564448, 1293252],
    ['bredviksvagen-15', 1595031, 1602579],
    ['ytterviksvagen-30a', 2004309, 1483957],
  ] as const)('%s lands on its totals', (name, debt, total) => {
    const a = analyse(name)
    expect(Math.round(a.debt.total.typical)).toBe(debt)
    expect(Math.round(a.forecast.total.typical)).toBe(total)
    // Every flag has a text.
    for (const p of a.plans)
      for (const f of p.flags) expect(flagText(f)).toBeTruthy()
  })
})
