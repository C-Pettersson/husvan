// Which of a house's parts belong to another building on the plot (CLAUDE.md,
// "Byggnader prissätts genom sina delar"). A roof or a facade registered at
// top level shares the house's estimated area with the house's own; one that
// belongs to the garage or a shed must sit under that building. Shared by
// the forecast's flag and the read-time warning (checks.ts).

// Words in a Swedish part name that place it on a garage, a carport or an
// outbuilding (komplementbyggnad: förråd, uthus, bod, gäststuga, attefallshus,
// friggebod, lekstuga, växthus, lusthus).
const OTHER_BUILDING =
  /garage|carport|f[öo]rr[åa]d|uthus|\bbod(en)?\b|vedbod|komplement|g[äa]ststuga|attefall|friggebod|lekstuga|v[äa]xthus|lusthus|ladug[åa]rd|verkstad/i

export function looksLikeOtherBuilding(name: string | null | undefined) {
  return !!name && OTHER_BUILDING.test(name)
}

// Types that are buildings of their own on the plot (forecastDefaults.
// separateBuilding in the library; listed here for the checks, which run
// without the library).
export const BUILDING_TYPES = ['garage', 'carport', 'outbuilding']

// Those whose roof the forecast assumes when nothing registers one
// (forecastDefaults.assumeParts).
export const BUILDINGS_WITH_ASSUMED_ROOF = ['garage', 'carport']
