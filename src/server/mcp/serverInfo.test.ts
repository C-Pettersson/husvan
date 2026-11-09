import { afterEach, describe, expect, it, vi } from 'vitest'
import { husvanServerInfo } from './serverInfo'

describe('husvanServerInfo', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('points the icons and website at the public origin', () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://husvan.se/')
    const info = husvanServerInfo()
    expect(info.websiteUrl).toBe('https://husvan.se/')
    expect(info.icons.map((icon) => icon.src)).toEqual([
      'https://husvan.se/apple-icon.png',
      'https://husvan.se/icon.svg',
    ])
    expect(info.icons[0].mimeType).toBe('image/png')
  })
})
