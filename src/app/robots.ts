import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/siteUrl'

// Read at run time: the image is built without BETTER_AUTH_URL, so a file
// generated at build time would name localhost. Cloudflare puts its managed
// rules for AI crawlers in front of this file.
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/api/' },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  }
}
