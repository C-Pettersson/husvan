// The public origin of the app. Better Auth's issuer and the MCP resource are
// derived from it, and the MCP resource must be exactly the URL the user types
// into Claude, so both come from this one value.
export function getSiteUrl(): string {
  const url = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
  return url.replace(/\/+$/, '')
}

export const MCP_PATH = '/api/mcp'

export function getMcpResource(): string {
  return `${getSiteUrl()}${MCP_PATH}`
}
