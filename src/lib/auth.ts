import { betterAuth } from 'better-auth'
import { prismaAdapter } from '@better-auth/prisma-adapter'
import { nextCookies } from 'better-auth/next-js'
import { jwt } from 'better-auth/plugins'
import { cimd } from '@better-auth/cimd'
import { fetchClientMetadataResource } from '@better-auth/cimd/node'
import { mcp } from '@better-auth/mcp'
import prisma from '@/lib/prisma'
import { getMcpResource, getSiteUrl } from '@/lib/siteUrl'

// One owner, seeded with `yarn db:seed`. Sign-up is off, so the only way in
// is the seeded email and password.
//
// mcp() makes this app the OAuth 2.1 authorization server for the MCP route.
// cimd() lets Claude identify itself with its published Client ID Metadata
// Document; Dynamic Client Registration stays off (see CLAUDE.md,
// "Autentisering: vad Claude kräver"). jwt() signs the access tokens and
// serves the JWKS that requireMcpAuth verifies against.
const SCOPES = ['openid', 'profile', 'email', 'offline_access']

export const auth = betterAuth({
  baseURL: getSiteUrl(),
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  plugins: [
    jwt(),
    mcp({
      loginPage: '/login',
      consentPage: '/consent',
      resource: getMcpResource(),
      scopes: SCOPES,
      // Declared explicitly so allowedScopes is a list. Left out, Better Auth
      // stores null (= no restriction), which a Prisma list column cannot hold.
      resources: [
        { identifier: getMcpResource(), name: 'Husvan', allowedScopes: SCOPES },
      ],
    }),
    cimd({
      fetchClientMetadataResource,
      metadataProfile: 'mcp-2026-07-28',
    }),
    nextCookies(),
  ],
})
