import { afterEach, describe, expect, it, vi } from 'vitest'
import robots, { dynamic as robotsDynamic } from './robots'
import sitemap, { dynamic as sitemapDynamic } from './sitemap'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('robots and sitemap', () => {
  it('name the public origin from the environment', () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://husvan.se/')

    expect(robots().sitemap).toBe('https://husvan.se/sitemap.xml')
    expect(sitemap()).toEqual([
      { url: 'https://husvan.se/' },
      { url: 'https://husvan.se/tools' },
      { url: 'https://husvan.se/demo' },
      { url: 'https://husvan.se/privacy' },
    ])
  })

  // The image is built without BETTER_AUTH_URL, so a statically generated file
  // would point Google at localhost.
  it('are generated at run time, not at build time', () => {
    expect(robotsDynamic).toBe('force-dynamic')
    expect(sitemapDynamic).toBe('force-dynamic')
  })

  it('keep crawlers out of the API but not the pages', () => {
    expect(robots().rules).toEqual({ userAgent: '*', disallow: '/api/' })
  })
})
