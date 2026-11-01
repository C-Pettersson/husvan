import { requireMcpAuth } from '@better-auth/mcp'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { auth } from '@/lib/auth'
import { getMcpResource } from '@/lib/siteUrl'
import { createHusvanMcpServer } from '@/server/mcp/server'

// Both protocol eras are served until milestone 0 shows which one Claude
// negotiates (CLAUDE.md, "Öppen punkt"). Each request logs its era so that the
// choice of `legacy: 'reject'` can be made from evidence.
const mcpHandler = createMcpHandler(
  (ctx) => {
    console.info(
      `[mcp] era=${ctx.era} protocol=${ctx.requestInfo?.headers.get('mcp-protocol-version') ?? '-'}`
    )
    return createHusvanMcpServer(ctx)
  },
  {
    onerror: (error) => console.error('[mcp]', error),
  }
)

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
  { resource: getMcpResource() }
)
