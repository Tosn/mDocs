import { describe, it, expect } from 'vitest'
import { chunkText } from './chunker'

describe('chunkText', () => {
  it('returns a single chunk for short text with correct offsets', () => {
    const c = chunkText('hello')
    expect(c.length).toBe(1)
    expect(c[0].text).toBe('hello')
    expect(c[0].charStart).toBe(0)
    expect(c[0].charEnd).toBe(5)
    expect(c[0].chunkIndex).toBe(0)
  })

  it('splits long text with overlap and exact offsets', () => {
    const text = 'a'.repeat(2500)
    const c = chunkText(text, { maxChars: 1000, overlap: 100 })
    expect(c.length).toBeGreaterThan(2)
    for (const ch of c) {
      expect(text.slice(ch.charStart, ch.charEnd)).toBe(ch.text)
    }
    // 索引递增
    expect(c.map((x) => x.chunkIndex)).toEqual(c.map((_, i) => i))
    // 相邻块重叠
    expect(c[1].charStart).toBeLessThan(c[0].charEnd)
  })

  it('returns no chunks for blank text', () => {
    expect(chunkText('   \n ')).toEqual([])
  })

  it('always makes progress even if overlap >= maxChars', () => {
    const c = chunkText('x'.repeat(50), { maxChars: 10, overlap: 100 })
    expect(c.length).toBeGreaterThan(1)
    expect(c[c.length - 1].charEnd).toBe(50)
  })
})
