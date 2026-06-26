import { describe, it, expect, beforeEach, vi } from 'vitest'

// 对 pdf.js 打桩（外部依赖），仅验证解析胶水逻辑。
const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }))
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ getDocument }))

import { parsePdf } from './pdf.parser'

function fakeDoc(pages: string[][]) {
  return {
    promise: Promise.resolve({
      numPages: pages.length,
      getPage: (n: number) =>
        Promise.resolve({
          getTextContent: () =>
            Promise.resolve({ items: pages[n - 1].map((str) => ({ str })) })
        })
    })
  }
}

beforeEach(() => getDocument.mockReset())

describe('parsePdf', () => {
  it('extracts text across all pages', async () => {
    getDocument.mockReturnValue(fakeDoc([['Hello', 'World'], ['Page2']]))
    const r = await parsePdf(new Uint8Array([1, 2, 3]))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data).toContain('Hello')
      expect(r.data).toContain('World')
      expect(r.data).toContain('Page2')
    }
  })

  it('forwards a plain Uint8Array to pdf.js even when given a Buffer', async () => {
    // pdf.js 4.x 拒绝 Buffer，必须传纯 Uint8Array。
    getDocument.mockReturnValue(fakeDoc([['x']]))
    await parsePdf(Buffer.from([1, 2, 3]))
    const arg = getDocument.mock.calls[0][0] as { data: unknown }
    expect(arg.data).toBeInstanceOf(Uint8Array)
    expect(Buffer.isBuffer(arg.data)).toBe(false)
  })

  it('returns E_PARSE_PDF on corrupt input', async () => {
    getDocument.mockReturnValue({ promise: Promise.reject(new Error('bad pdf')) })
    const r = await parsePdf(new Uint8Array([0]))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('E_PARSE_PDF')
  })

  it('returns E_EMPTY when no text is found', async () => {
    getDocument.mockReturnValue(fakeDoc([['  '], ['']]))
    const r = await parsePdf(new Uint8Array([1]))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('E_EMPTY')
  })
})
