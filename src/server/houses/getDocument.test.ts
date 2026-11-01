import { describe, expect, it } from 'vitest'
import { textPage } from './getDocument'

describe('textPage', () => {
  it('returns the whole text when it fits', () => {
    expect(textPage('Utgångspris 3 995 000 kr', 0, 1000)).toEqual({
      content: 'Utgångspris 3 995 000 kr',
      offset: 0,
      totalLength: 24,
      nextOffset: null,
    })
  })

  it('pages through a long text without gaps or overlap', () => {
    const text = 'abcdefghij'
    const pages = []
    let offset: number | null = 0
    while (offset !== null) {
      const page = textPage(text, offset, 4)
      pages.push(page.content)
      offset = page.nextOffset
    }
    expect(pages).toEqual(['abcd', 'efgh', 'ij'])
  })

  it('ends a page before a split surrogate pair', () => {
    const text = 'ab😀cd'
    const first = textPage(text, 0, 3)
    expect(first.content).toBe('ab')
    expect(first.nextOffset).toBe(2)
    expect(textPage(text, 2, 3).content).toBe('😀c')
  })

  it('returns an empty last page past the end', () => {
    expect(textPage('abc', 10, 4)).toEqual({
      content: '',
      offset: 3,
      totalLength: 3,
      nextOffset: null,
    })
  })
})
