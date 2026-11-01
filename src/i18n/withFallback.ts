type Messages = { [key: string]: string | Messages }

// Deep merge where every key missing from `messages` is taken from `fallback`.
export function withFallback(messages: Messages, fallback: Messages): Messages {
  const result: Messages = { ...fallback }
  for (const [key, value] of Object.entries(messages)) {
    const base = fallback[key]
    result[key] =
      typeof value === 'object' && typeof base === 'object'
        ? withFallback(value, base)
        : value
  }
  return result
}
