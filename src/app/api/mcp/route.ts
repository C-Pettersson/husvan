import { requireMcpAuth } from '@better-auth/mcp'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { auth } from '@/lib/auth'
import { getInternalUrl, getMcpResource } from '@/lib/siteUrl'
import { createHusvanMcpServer } from '@/server/mcp/server'

// Only the 2026-07-28 protocol, which is what claude.ai uses (verified in
// milestone 0). Requests in the 2025 protocol get an unsupported-version error.
const mcpHandler = createMcpHandler(createHusvanMcpServer, {
  legacy: 'reject',
  onerror: (error) => console.error('[mcp]', error),
})

export const POST = requireMcpAuth(
  auth,
  (request, claims) =>
    mcpHandler.fetch(request, {
      authInfo: {
        token: '',
        clientId: String(claims.azp ?? claims.client_id ?? ''),
        scopes: String(claims.scope ?? '')
          .split(' ')
          .filter(Boolean),
        expiresAt: claims.exp,
        extra: { userId: claims.sub },
      },
    }),
  {
    resource: getMcpResource(),
    jwksUrl: `${getInternalUrl()}/api/auth/jwks`,
  }
)
