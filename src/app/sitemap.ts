import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/siteUrl'

// Read at run time, for the same reason as robots.ts.
export const dynamic = 'force-dynamic'

// The public pages. Everything else requires sign-in.
export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteUrl()
  return [
    { url: `${site}/` },
    { url: `${site}/tools` },
    { url: `${site}/privacy` },
  ]
}
