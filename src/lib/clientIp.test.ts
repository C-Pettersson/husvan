import { describe, expect, it } from 'vitest'
import { getIP } from '@better-auth/core/utils/ip'
import { IP_ADDRESS_HEADERS } from './clientIp'

// The same shape auth.ts hands to betterAuth(), resolved with Better Auth's
// own reader so the test breaks if the option moves or is renamed.
const options = {
  advanced: { ipAddress: { ipAddressHeaders: IP_ADDRESS_HEADERS } },
}

function request(headers: Record<string, string>) {
  return new Request('https://husvan.se/api/auth/sign-in/magic-link', {
    headers,
  })
}

describe('IP_ADDRESS_HEADERS', () => {
  it('resolves the client IP from CF-Connecting-IP', () => {
    expect(getIP(request({ 'CF-Connecting-IP': '203.0.113.7' }), options)).toBe(
      '203.0.113.7'
    )
  })

  it('prefers CF-Connecting-IP over X-Forwarded-For', () => {
    expect(
      getIP(
        request({
          'CF-Connecting-IP': '203.0.113.7',
          'X-Forwarded-For': '198.51.100.9, 172.70.0.1',
        }),
        options
      )
    ).toBe('203.0.113.7')
  })

  it('falls back to a single-valued X-Forwarded-For', () => {
    expect(getIP(request({ 'X-Forwarded-For': '198.51.100.9' }), options)).toBe(
      '198.51.100.9'
    )
  })
})
