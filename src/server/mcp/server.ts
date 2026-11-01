import { McpServer, type McpRequestContext } from '@modelcontextprotocol/server'
import prisma from '@/lib/prisma'
import { registerReadTools } from './readTools'

// One server instance per request. requireMcpAuth has already verified the
// token; the route passes its subject (the user id) in authInfo.extra.
export function createHusvanMcpServer(ctx: McpRequestContext): McpServer {
  const userId = ctx.authInfo?.extra?.userId
  if (typeof userId !== 'string') {
    throw new Error('MCP request reached the server without a verified user')
  }

  const server = new McpServer({ name: 'husvan', version: '0.3.0' })
  registerReadTools(server, prisma, userId)
  return server
}
