import { describe, expect, it } from 'vitest'
import { backfill } from './saveDocument'

describe('backfill', () => {
  it('names the fields a repeated save fills in, never one already stored', () => {
    expect(
      backfill(
        {
          title: 'Protokoll',
          filename: null,
          fullText: null,
          interpretation: { pages: 3 },
          documentDate: null,
        },
        {
          title: 'Annan titel',
          filename: 'bp.pdf',
          fullText: 'Sida 1 …',
          interpretation: { pages: 4 },
          documentDate: '2026-10-30',
        }
      )
    ).toEqual(['filename', 'fullText', 'documentDate'])
  })

  it('does not fill with empty text or nothing', () => {
    expect(backfill({ fullText: null }, { fullText: '' })).toEqual([])
    expect(backfill({ fullText: null }, {})).toEqual([])
  })
})
