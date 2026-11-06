import { describe, expect, it } from 'vitest'
import { createCallLimiter } from './rateLimit'

describe('createCallLimiter', () => {
  it('stops a user at the limit per minute and lets them go on after it', () => {
    const check = createCallLimiter({ perMinute: 2, perDay: 100 })
    expect(check('a', 0)).toBeNull()
    expect(check('a', 1000)).toBeNull()
    expect(check('a', 2000)).toBe(58)
    expect(check('a', 60_000)).toBeNull()
  })

  it('counts each user on their own', () => {
    const check = createCallLimiter({ perMinute: 1, perDay: 100 })
    expect(check('a', 0)).toBeNull()
    expect(check('a', 1)).not.toBeNull()
    expect(check('b', 1)).toBeNull()
  })

  it('stops a user at the limit per day', () => {
    const check = createCallLimiter({ perMinute: 100, perDay: 2 })
    const hour = 60 * 60 * 1000
    expect(check('a', 0)).toBeNull()
    expect(check('a', hour)).toBeNull()
    expect(check('a', 2 * hour)).toBe(22 * 60 * 60)
    expect(check('a', 24 * hour)).toBeNull()
  })

  it('does not count refused calls', () => {
    const check = createCallLimiter({ perMinute: 1, perDay: 2 })
    expect(check('a', 0)).toBeNull()
    expect(check('a', 1)).not.toBeNull()
    expect(check('a', 2)).not.toBeNull()
    expect(check('a', 60_000)).toBeNull()
  })
})
