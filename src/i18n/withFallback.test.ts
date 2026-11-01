import { describe, expect, it } from 'vitest'
import { withFallback } from './withFallback'

describe('withFallback', () => {
  it('keeps translated keys and fills missing ones from the fallback', () => {
    const sv = { login: { title: 'Logga in', submit: 'Logga in' }, home: 'Hem' }
    const en = { login: { title: 'Sign in' } }

    expect(withFallback(en, sv)).toEqual({
      login: { title: 'Sign in', submit: 'Logga in' },
      home: 'Hem',
    })
  })
})
