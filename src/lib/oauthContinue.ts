// When /api/auth/oauth2/authorize has no session it redirects to /login with
// the original authorization parameters plus a signature (sig, exp, ba_*).
//
// An email and password sign-in continues that authorization by itself: the
// auth client sends the signed query along, and the server resumes in the same
// request. A login link cannot, because the link is opened in a new request
// without the query. So the link's callback re-enters the authorize endpoint
// with the original parameters; with a session in place it goes on to consent
// and back to the app that asked.

const SIGNATURE_PARAMS = new Set(['sig', 'exp', 'ba_iat', 'ba_pl', 'ba_param'])

// prompt=login would send the user straight back to /login, and max_age could
// reject a session created moments ago.
const RESTART_PARAMS = new Set(['prompt', 'max_age'])

export function authorizationCallbackURL(
  search: string,
  fallback: string
): string {
  const params = new URLSearchParams(search)
  if (!params.has('sig') || !params.has('client_id')) return fallback
  const kept = new URLSearchParams()
  for (const [key, value] of params) {
    if (SIGNATURE_PARAMS.has(key) || RESTART_PARAMS.has(key)) continue
    kept.append(key, value)
  }
  return `/api/auth/oauth2/authorize?${kept.toString()}`
}

export function isOAuthLogin(search: string): boolean {
  const params = new URLSearchParams(search)
  return params.has('sig') && params.has('client_id')
}
