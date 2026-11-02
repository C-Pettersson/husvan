import { createAuthClient } from 'better-auth/react'
import { magicLinkClient } from 'better-auth/client/plugins'
import { oauthProviderClient } from '@better-auth/oauth-provider/client'

// oauthProviderClient sends the signed oauth_query along with sign-in, so a
// password login that started at /oauth2/authorize continues the authorization
// by itself. A login link continues it through its callback URL instead; see
// src/lib/oauthContinue.ts.
export const authClient = createAuthClient({
  plugins: [magicLinkClient(), oauthProviderClient()],
})
