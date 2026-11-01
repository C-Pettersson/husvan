import { createAuthClient } from 'better-auth/react'
import { oauthProviderClient } from '@better-auth/oauth-provider/client'

// oauthProviderClient sends the signed oauth_query along with sign-in, so a
// login that started at /oauth2/authorize continues the authorization by itself.
export const authClient = createAuthClient({
  plugins: [oauthProviderClient()],
})
