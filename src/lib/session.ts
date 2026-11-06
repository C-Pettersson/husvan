import { cache } from 'react'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'

// The session for the current request. Cached per render, so that a page and
// the header it sits under share one lookup.
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() })
)
