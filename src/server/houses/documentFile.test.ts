import { describe, expect, it } from 'vitest'
import { MAX_IMAGE_BYTES, fileBlock } from './documentFile'

const id = '01a19755-70b6-7830-a26c-701e69f10315'
const bytes = (text: string) => new TextEncoder().encode(text)

describe('fileBlock', () => {
  it('gives a photo as an image', () => {
    const r = fileBlock(id, 'image/jpeg', bytes('jpeg'))
    expect(r).toEqual({
      ok: true,
      block: { type: 'image', data: 'anBlZw==', mimeType: 'image/jpeg' },
    })
  })

  it('gives a PDF as an embedded blob, unchanged', () => {
    const r = fileBlock(id, 'application/pdf', bytes('%PDF-1.7'))
    expect(r).toEqual({
      ok: true,
      block: {
        type: 'resource',
        resource: {
          uri: `husvan://documents/${id}`,
          mimeType: 'application/pdf',
          blob: Buffer.from('%PDF-1.7').toString('base64'),
        },
      },
    })
  })

  it('gives a text file as embedded text', () => {
    const r = fileBlock(id, 'text/plain', bytes('Golvbrunn i gjutjärn'))
    expect(r.ok && r.block).toMatchObject({
      resource: { mimeType: 'text/plain', text: 'Golvbrunn i gjutjärn' },
    })
  })

  it('refuses HEIC and images the model cannot take', () => {
    expect(fileBlock(id, 'image/heic', bytes('heic'))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/image\/heic/),
    })
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1)
    expect(fileBlock(id, 'image/png', big)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/over the 5\.0 MB/),
    })
  })
})
