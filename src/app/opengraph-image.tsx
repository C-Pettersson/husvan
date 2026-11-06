import { ImageResponse } from 'next/og'
import messages from '../../messages/sv.json'

// The picture in a shared link. Swedish only: whatever fetches a link preview
// has no locale cookie, so it gets the default language anyway.
const { title, meta } = messages.home

export const alt = title
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 80,
        backgroundColor: '#fbfaf7',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* The same drawing as src/app/icon.svg and LogoMark. */}
        <svg width="72" height="72" viewBox="0 0 32 32">
          <path
            fill="#2f5d50"
            fillRule="evenodd"
            d="M5 28a1 1 0 0 1-1-1V14.6a1 1 0 0 1 .36-.77l11-9.3a1 1 0 0 1 1.28 0l11 9.3a1 1 0 0 1 .36.77V27a1 1 0 0 1-1 1zM8 18v6h4v-6zm12-2v8h4v-8z"
          />
          <rect fill="#b5663c" x="14" y="12" width="4" height="12" />
        </svg>
        <div style={{ color: '#2f5d50', fontSize: 48 }}>Husvan</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div style={{ color: '#23302c', fontSize: 76, lineHeight: 1.1 }}>
          {title}
        </div>
        <div style={{ color: '#55605c', fontSize: 34, lineHeight: 1.35 }}>
          {meta.description}
        </div>
      </div>
    </div>,
    size
  )
}
