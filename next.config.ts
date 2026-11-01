import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // The dev server is reached through the Cloudflare Tunnel during
  // milestone 0 (CLAUDE.md, "HTTPS före k3s").
  allowedDevOrigins: ['dev.husvan.se'],
  turbopack: {
    root: __dirname,
  },
}

export default withNextIntl(nextConfig)
