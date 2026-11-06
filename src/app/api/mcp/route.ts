import { requireMcpAuth } from '@better-auth/mcp'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { getInternalUrl, getMcpResource } from '@/lib/siteUrl'
import { createCallLimiter } from '@/server/mcp/rateLimit'
import { createHusvanMcpServer } from '@/server/mcp/server'
import { isUserBlocked } from '@/server/users/allowlist'

// Only the 2026-07-28 protocol, which is what claude.ai uses (verified in
// milestone 0). Requests in the 2025 protocol get an unsupported-version error.
const mcpHandler = createMcpHandler(createHusvanMcpServer, {
  legacy: 'reject',
  onerror: (error) => console.error('[mcp]', error),
})

const checkCallLimit = createCallLimiter()

const refused = (status: number, message: string, headers = {}) =>
  Response.json(
    { jsonrpc: '2.0', error: { code: -32000, message }, id: null },
    { status, headers }
  )

export const POST = requireMcpAuth(
  auth,
  async (request, claims) => {
    const userId = String(claims.sub)
    const wait = checkCallLimit(userId)
    if (wait !== null)
      return refused(
        429,
        `Too many calls to Husvan from this account. Try again in ${wait} seconds.`,
        { 'retry-after': String(wait) }
      )
    if (await isUserBlocked(prisma, userId))
      return refused(403, 'This account may no longer use Husvan.')
    return mcpHandler.fetch(request, {
      authInfo: {
        token: '',
        clientId: String(claims.azp ?? claims.client_id ?? ''),
        scopes: String(claims.scope ?? '')
          .split(' ')
          .filter(Boolean),
        expiresAt: claims.exp,
        extra: { userId: claims.sub },
      },
    })
  },
  {
    resource: getMcpResource(),
    jwksUrl: `${getInternalUrl()}/api/auth/jwks`,
  }
)
