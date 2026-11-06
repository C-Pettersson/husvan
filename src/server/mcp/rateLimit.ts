// Calls per user on the MCP route. Every call comes from Anthropic's range, so
// a limit per IP in Cloudflare would throttle all users together; this one
// counts per user. In memory, which holds with one replica; a restart starts
// the count over. The entries are bounded by the number of accounts.
export const MCP_CALLS_PER_MINUTE = 120
export const MCP_CALLS_PER_DAY = 5000

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

type Window = { start: number; calls: number }

export function createCallLimiter({
  perMinute = MCP_CALLS_PER_MINUTE,
  perDay = MCP_CALLS_PER_DAY,
} = {}) {
  const users = new Map<string, { minute: Window; day: Window }>()

  // Counts the call. Returns how many seconds to wait if it is over a limit,
  // or null if it may go ahead.
  return function check(userId: string, now = Date.now()): number | null {
    const user = users.get(userId) ?? {
      minute: { start: now, calls: 0 },
      day: { start: now, calls: 0 },
    }
    users.set(userId, user)
    if (now - user.minute.start >= MINUTE)
      user.minute = { start: now, calls: 0 }
    if (now - user.day.start >= DAY) user.day = { start: now, calls: 0 }

    if (user.day.calls >= perDay)
      return Math.ceil((user.day.start + DAY - now) / 1000)
    if (user.minute.calls >= perMinute)
      return Math.ceil((user.minute.start + MINUTE - now) / 1000)
    user.minute.calls++
    user.day.calls++
    return null
  }
}
