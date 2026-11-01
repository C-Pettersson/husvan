import { McpServer, type McpRequestContext } from '@modelcontextprotocol/server'
import prisma from '@/lib/prisma'

// One server instance per request. requireMcpAuth has already verified the
// token; the route passes its subject (the user id) in authInfo.extra.
export function createHusvanMcpServer(ctx: McpRequestContext): McpServer {
  const userId = ctx.authInfo?.extra?.userId
  if (typeof userId !== 'string') {
    throw new Error('MCP request reached the server without a verified user')
  }

  const server = new McpServer({ name: 'husvan', version: '0.1.0' })

  // Milestone 0: proves that Claude reaches the server, signs in and that
  // the token maps to the seeded user. Replaced by the read tools in
  // milestone 3.
  server.registerTool(
    'whoami',
    {
      description:
        'Returns the Husvan user this connection is signed in as and the MCP protocol era of the request. Use it to check that the connection works.',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      })
      const result = {
        user,
        protocolEra: ctx.era,
        protocolVersion:
          ctx.requestInfo?.headers.get('mcp-protocol-version') ?? null,
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      }
    }
  )

  return server
}
