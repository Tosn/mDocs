import { describe, it, expect } from 'vitest'
import { parseTxt } from './txt.parser'

describe('parseTxt', () => {
  it('returns the text content', () => {
    const r = parseTxt('hello world')
    expect(r).toEqual({ ok: true, data: 'hello world' })
  })

  it('accepts a Buffer', () => {
    const r = parseTxt(Buffer.from('from buffer', 'utf-8'))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toBe('from buffer')
  })

  it('normalizes CRLF to LF and trims', () => {
    const r = parseTxt('  line1\r\nline2  ')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toBe('line1\nline2')
  })

  it('rejects empty / whitespace-only content', () => {
    const r = parseTxt('   \n\t ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('E_EMPTY')
  })
})
