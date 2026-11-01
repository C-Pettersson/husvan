// Which lifespan profile applies to a component. The one place this rule
// lives, so the forecast, the maintenance debt and the web agree.
//
// No path aliases in this file, as in schema.ts.

type Profile = { match?: Record<string, string> }

// Among the profiles whose match fits the component's attributes, the one that
// matches the earliest key in profileKeyOrder wins, then the next key, and so
// on; after that, more matched keys beat fewer. A profile with an empty match
// is the default. validateLibrary ensures this never ties.
export function selectProfile<P extends Profile>(
  profiles: P[],
  attributes: Record<string, string | null | undefined>,
  profileKeyOrder: string[] = []
): P | undefined {
  const rank = (p: P) => {
    const keys = Object.keys(p.match ?? {})
    return [
      ...profileKeyOrder.map((k) => (keys.includes(k) ? 1 : 0)),
      keys.length,
    ]
  }
  const fits = profiles.filter((p) =>
    Object.entries(p.match ?? {}).every(([k, v]) => attributes[k] === v)
  )
  return fits.sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    const i = ra.findIndex((v, j) => v !== rb[j])
    return i === -1 ? 0 : rb[i] - ra[i]
  })[0]
}
