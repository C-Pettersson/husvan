import { getSiteUrl } from '@/lib/siteUrl'

// What the server says about itself to the client. Clients may show the icon
// and title next to the connector. The icon URLs must be absolute and public:
// the files are the app's own icons under src/app, which Cloudflare serves
// without Access. PNG comes first because every client must support it; SVG is
// optional in the spec.
export function husvanServerInfo() {
  const site = getSiteUrl()
  return {
    name: 'husvan',
    title: 'Husvan',
    version: '0.5.0',
    description: 'What a house costs over time: components, forecasts and comparisons.',
    websiteUrl: `${site}/`,
    icons: [
      { src: `${site}/apple-icon.png`, mimeType: 'image/png', sizes: ['180x180'] },
      { src: `${site}/icon.svg`, mimeType: 'image/svg+xml', sizes: ['any'] },
    ],
  }
}
