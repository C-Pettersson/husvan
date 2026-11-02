import { createAuthClient } from 'better-auth/react'
import { emailOTPClient, magicLinkClient } from 'better-auth/client/plugins'
import { oauthProviderClient } from '@better-auth/oauth-provider/client'

// oauthProviderClient sends the signed oauth_query along with sign-in, so a
// password login that started at /oauth2/authorize continues the authorization
// by itself, and so does a sign-in with the code from the login mail. A login
// link continues it through its callback URL instead; see
// src/lib/oauthContinue.ts.
export const authClient = createAuthClient({
  plugins: [magicLinkClient(), emailOTPClient(), oauthProviderClient()],
})
