import { describe, it, expect } from 'vitest'
import { parseMd } from './md.parser'

describe('parseMd', () => {
  it('keeps markdown body text', () => {
    const r = parseMd('# Title\n\nsome **body** text')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data).toContain('# Title')
      expect(r.data).toContain('some **body** text')
    }
  })

  it('accepts a Buffer and normalizes CRLF', () => {
    const r = parseMd(Buffer.from('# H\r\nline', 'utf-8'))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data).toBe('# H\nline')
      expect(r.data).not.toContain('\r')
    }
  })

  it('rejects empty content', () => {
    const r = parseMd('   ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('E_EMPTY')
  })
})
