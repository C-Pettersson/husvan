import { describe, expect, it } from 'vitest'
import { authorizationCallbackURL, isOAuthLogin } from './oauthContinue'

const loginSearch =
  '?client_id=https%3A%2F%2Fclaude.ai%2Foauth%2Fmcp-oauth-client-metadata' +
  '&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback' +
  '&response_type=code&scope=openid+profile+email+offline_access&state=xyz' +
  '&code_challenge=abc&code_challenge_method=S256' +
  '&resource=https%3A%2F%2Fhusvan.se%2Fapi%2Fmcp&prompt=login' +
  '&exp=1700000000&ba_iat=1699999000&ba_param=client_id&ba_param=exp&sig=deadbeef'

describe('authorizationCallbackURL', () => {
  it('re-enters authorize with the original parameters only', () => {
    const url = authorizationCallbackURL(loginSearch, '/houses')
    expect(url.startsWith('/api/auth/oauth2/authorize?')).toBe(true)
    const params = new URLSearchParams(url.slice(url.indexOf('?') + 1))
    expect(params.get('client_id')).toBe(
      'https://claude.ai/oauth/mcp-oauth-client-metadata'
    )
    expect(params.get('redirect_uri')).toBe(
      'https://claude.ai/api/mcp/auth_callback'
    )
    expect(params.get('scope')).toBe('openid profile email offline_access')
    expect(params.get('code_challenge')).toBe('abc')
    expect(params.get('state')).toBe('xyz')
    for (const gone of ['sig', 'exp', 'ba_iat', 'ba_param', 'prompt']) {
      expect(params.has(gone)).toBe(false)
    }
  })

  it('falls back when the login did not start at authorize', () => {
    expect(authorizationCallbackURL('', '/houses')).toBe('/houses')
    expect(authorizationCallbackURL('?error=INVALID_TOKEN', '/houses')).toBe(
      '/houses'
    )
    expect(authorizationCallbackURL('?client_id=x', '/houses')).toBe('/houses')
  })
})

describe('isOAuthLogin', () => {
  it('needs both the signature and a client', () => {
    expect(isOAuthLogin(loginSearch)).toBe(true)
    expect(isOAuthLogin('?sig=1')).toBe(false)
    expect(isOAuthLogin('')).toBe(false)
  })
})
