import { oauthProviderOpenIdConfigMetadata } from '@better-auth/oauth-provider'
import { auth } from '@/lib/auth'

// OpenID discovery by path insertion. Better Auth also serves it by path
// appending at /api/auth/.well-known/openid-configuration.
export const GET = oauthProviderOpenIdConfigMetadata(auth)
