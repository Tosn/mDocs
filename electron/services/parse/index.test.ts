import { describe, it, expect, beforeEach, vi } from 'vitest'

const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }))
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ getDocument }))

import { parseByType } from './index'

beforeEach(() => getDocument.mockReset())

describe('parseByType', () => {
  it('dispatches txt', async () => {
    const r = await parseByType('txt', 'hello')
    expect(r).toEqual({ ok: true, data: 'hello' })
  })

  it('dispatches md', async () => {
    const r = await parseByType('md', '# Title\nbody')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toContain('# Title')
  })

  it('treats web as markdown', async () => {
    const r = await parseByType('web', '# Page\ncontent')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toContain('# Page')
  })

  it('dispatches pdf to the pdf parser', async () => {
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: () =>
          Promise.resolve({
            getTextContent: () => Promise.resolve({ items: [{ str: 'PDFTEXT' }] })
          })
      })
    })
    const r = await parseByType('pdf', new Uint8Array([1]))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toContain('PDFTEXT')
  })

  it('rejects unsupported types', async () => {
    // @ts-expect-error 故意传入非法类型
    const r = await parseByType('xls', 'x')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('E_UNSUPPORTED')
  })
})
