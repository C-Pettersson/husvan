import { describe, expect, it } from 'vitest'
import {
  ENERGY_ITEM,
  forecastDifferences,
  type DifferenceHouse,
} from './differences'
import type { ForecastItem } from './forecast'
import type { ComponentPlan, PlanBasis } from './plan'

const item = (
  category: ForecastItem['category'],
  key: string,
  typical: number,
  basis?: ForecastItem['basis']
): ForecastItem => ({
  category,
  key,
  basis,
  typical: [],
  total: { low: typical, typical, high: typical },
  flags: [],
})

const plan = (type: string, basis: PlanBasis) =>
  ({ componentId: type, type, basis }) as ComponentPlan

const house = (h: Partial<DifferenceHouse>): DifferenceHouse => ({
  items: [],
  plans: [],
  absent: [],
  inspected: true,
  runningCostsKnown: true,
  ...h,
})

describe('forecastDifferences', () => {
  it('compares heating and electricity as one energy line', () => {
    const rows = forecastDifferences([
      house({
        items: [
          item('running', 'heating_cost_sek_per_year', 15000, 'stated'),
          item(
            'running',
            'household_electricity_cost_sek_per_year',
            6000,
            'stated'
          ),
        ],
      }),
      house({
        items: [
          item(
            'running',
            'household_electricity_cost_sek_per_year',
            24000,
            'stated'
          ),
        ],
      }),
      // Only a total: the energy is inside it.
      house({
        items: [
          item('running', 'operating_cost_sek_per_year', 40000, 'stated'),
        ],
      }),
      house({ runningCostsKnown: false }),
    ])
    const energy = rows.find((r) => r.item === ENERGY_ITEM)!
    expect(energy.sek).toEqual([21000, 24000, null, null])
    expect(energy.basis).toEqual([
      'stated',
      'stated',
      'in_operating_total',
      'unknown',
    ])
    expect(energy.spread).toBe(3000)
    expect(rows.some((r) => r.item.startsWith('running:heating'))).toBe(false)
  })

  it('leaves a part type the documents do not mention unknown, not zero', () => {
    const rows = forecastDifferences([
      house({
        items: [item('replacement', 'bathroom', 215000)],
        plans: [
          plan('bathroom', 'documented'),
          plan('bathroom', 'construction_year'),
        ],
      }),
      house({ plans: [] }),
      house({ absent: ['bathroom'] }),
      // A part whose replacement falls outside the horizon still has a basis.
      house({ plans: [plan('bathroom', 'documented')] }),
    ])
    expect(rows).toEqual([
      {
        item: 'replacement:bathroom',
        sek: [215000, null, 0, 0],
        basis: ['construction_year', 'not_documented', 'absent', 'documented'],
        spread: 215000,
      },
    ])
  })

  it('leaves the work items of an uninspected house unknown', () => {
    const rows = forecastDifferences([
      house({ items: [item('work_item', 'repair', 160000, 'documented')] }),
      house({ inspected: false }),
      house({
        inspected: false,
        items: [item('work_item', 'repair', 2000, 'documented')],
      }),
    ])
    expect(rows[0].sek).toEqual([160000, null, 2000])
    expect(rows[0].basis).toEqual([
      'inspected',
      'not_inspected',
      'not_inspected',
    ])
  })

  it('sorts by the spread over the known cells and keeps the largest', () => {
    const rows = forecastDifferences(
      [
        house({
          items: [
            item('replacement', 'roof_covering', 100000),
            item('replacement', 'window', 50000),
          ],
          plans: [
            plan('roof_covering', 'documented'),
            plan('window', 'documented'),
          ],
        }),
        house({
          items: [item('replacement', 'window', 90000)],
          plans: [plan('window', 'documented')],
        }),
      ],
      1
    )
    // The roof is unknown in the second house, so its spread is 0.
    expect(rows.map((r) => r.item)).toEqual(['replacement:window'])
  })
})
