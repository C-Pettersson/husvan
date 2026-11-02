import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { prismaAdapter } from '@better-auth/prisma-adapter'
import { nextCookies } from 'better-auth/next-js'
import { captcha, jwt, magicLink } from 'better-auth/plugins'
import { cimd } from '@better-auth/cimd'
import { fetchClientMetadataResource } from '@better-auth/cimd/node'
import { mcp } from '@better-auth/mcp'
import prisma from '@/lib/prisma'
import { getMcpResource, getSiteUrl } from '@/lib/siteUrl'
import { LOCALE_COOKIE } from '@/i18n/locales'
import { deliverMagicLink, resolveLocale } from '@/server/auth/magicLink'
import { createMailer } from '@/server/mail/sendMail'
import { isEmailAllowed } from '@/server/users/allowlist'
import { TURNSTILE_ACTION } from '@/lib/turnstile'
import { IP_ADDRESS_HEADERS } from '@/lib/clientIp'

// Who may sign in is the allowlist (table allowed_email, managed on /admin by
// an ADMIN). Sign-up is off; a user row is created the first time an allowed
// address follows a login link. The seeded owner keeps an optional email and
// password login as a fallback.
//
// mcp() makes this app the OAuth 2.1 authorization server for the MCP route.
// cimd() lets Claude identify itself with its published Client ID Metadata
// Document; Dynamic Client Registration stays off (see CLAUDE.md,
// "Autentisering: vad Claude kräver"). jwt() signs the access tokens and
// serves the JWKS that requireMcpAuth verifies against.
const SCOPES = ['openid', 'profile', 'email', 'offline_access']

export const MAGIC_LINK_MINUTES = 10

const mailer = createMailer()

// Turnstile guards the two endpoints that take an address from the open web.
// Without a secret (local work) the check is off; the login page then renders
// no widget either, since TURNSTILE_SITE_KEY is unset too. In production the
// token must also come from the login widget (action "login") on one of our
// own hostnames: TURNSTILE_HOSTNAMES, or the public origin's host when that is
// unset. Cloudflare's test keys answer with hostname example.com and no action,
// so outside production those two checks apply only when TURNSTILE_HOSTNAMES
// is set on purpose.
const turnstileSecret = process.env.TURNSTILE_SECRET?.trim()
const turnstileStrict =
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.TURNSTILE_HOSTNAMES?.trim())
const turnstileHostnames = (
  process.env.TURNSTILE_HOSTNAMES?.split(',') ?? [
    new URL(getSiteUrl()).hostname,
  ]
)
  .map((h) => h.trim())
  .filter(Boolean)

export const auth = betterAuth({
  baseURL: getSiteUrl(),
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  advanced: {
    // Rate limiting keys on the client IP; see src/lib/clientIp.ts for why
    // these headers and no trustedProxies.
    ipAddress: { ipAddressHeaders: IP_ADDRESS_HEADERS },
  },
  user: {
    additionalFields: {
      // Mirrors the Prisma enum UserRole. input: false keeps it out of every
      // request body; only the seed and the database set it.
      role: { type: 'string', defaultValue: 'USER', input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Second line of defence behind deliverMagicLink: no user row for an
        // address that is not on the allowlist, whatever path got here.
        before: async (user) => {
          if (!(await isEmailAllowed(prisma, user.email))) {
            throw new APIError('FORBIDDEN', {
              message: 'This address is not allowed to sign in',
            })
          }
        },
      },
    },
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
    magicLink({
      expiresIn: MAGIC_LINK_MINUTES * 60,
      sendMagicLink: async ({ email, url }, ctx) => {
        await deliverMagicLink(
          { prisma, mailer },
          {
            email,
            url,
            locale: resolveLocale(ctx?.getCookie(LOCALE_COOKIE) ?? undefined),
            expiresInMinutes: MAGIC_LINK_MINUTES,
          }
        )
      },
    }),
    ...(turnstileSecret
      ? [
          captcha({
            provider: 'cloudflare-turnstile',
            secretKey: turnstileSecret,
            endpoints: ['/sign-in/magic-link', '/sign-in/email'],
            ...(turnstileStrict && {
              expectedAction: TURNSTILE_ACTION,
              allowedHostnames: turnstileHostnames,
            }),
          }),
        ]
      : []),
    nextCookies(),
  ],
})
