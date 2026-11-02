// Where Better Auth reads the client IP for rate limiting (see
// advanced.ipAddress in src/lib/auth.ts).
//
// Production sits behind Cloudflare and Traefik. Cloudflare puts the visitor's
// address in CF-Connecting-IP, and nothing but Cloudflare reaches the origin
// (the WAF rule and Traefik's ipAllowList, see CLAUDE.md "Leverans och
// drift"), so that single-valued header is trusted as it is. X-Forwarded-For
// is the fallback when the request did not pass Cloudflare, for example
// through a Tailscale ingress straight to Traefik; Better Auth accepts it only
// while it holds a single address, since no trustedProxies are configured.
// Without either header development and test resolve to 127.0.0.1, while
// production falls back to one shared bucket per path and logs a warning.
export const IP_ADDRESS_HEADERS = ['cf-connecting-ip', 'x-forwarded-for']
