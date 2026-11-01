import { auth } from '@/lib/auth'

// RFC 9728 metadata for the MCP route. The mcp() plugin builds the document;
// this route only lets the request reach Better Auth from the site root.
export const GET = (req: Request) => auth.handler(req)
