// The house page in groups, one at a time, so that nothing is far down a
// long page: what the house costs, the checklist for the viewing, what is
// known about the house, its documents and its area. The tab is in the
// address (?tab=), so a link can open the checklist directly. Outside the
// client component, since the server page reads it too.
export const HOUSE_TABS = [
  'cost',
  'viewing',
  'house',
  'documents',
  'area',
] as const

export type HouseTab = (typeof HOUSE_TABS)[number]

export const houseTab = (value: string | undefined) =>
  HOUSE_TABS.find((t): t is HouseTab => t === value)
