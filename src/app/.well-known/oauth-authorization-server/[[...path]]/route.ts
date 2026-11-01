import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider'
import { auth } from '@/lib/auth'

// RFC 8414 metadata. The issuer is /api/auth, so clients look for it at
// /.well-known/oauth-authorization-server/api/auth.
export const GET = oauthProviderAuthServerMetadata(auth)
