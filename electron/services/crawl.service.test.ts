import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { openDb } from '../db/index'
import { htmlToMarkdown, fromUrl } from './crawl.service'
import { isOk } from '@shared/types'

const sampleHtml = `<html><head><title>My Article</title></head><body>
<article><h1>My Article</h1>
<p>${'This is a meaningful paragraph about readability extraction and testing. '.repeat(10)}</p>
<p>${'Second paragraph with an image and more body content for the heuristics. '.repeat(10)}<img src="https://example.com/img.png" alt="pic"></p>
</article></body></html>`

let db: Database.Database
beforeEach(() => {
  db = openDb(':memory:')
})
afterEach(() => {
  db.close()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('crawl.service', () => {
  it('htmlToMarkdown extracts body text and keeps images', () => {
    const r = htmlToMarkdown(sampleHtml, 'https://example.com/a')
    expect(isOk(r)).toBe(true)
    if (isOk(r)) {
      expect(r.data.markdown).toContain('meaningful paragraph')
      expect(r.data.markdown).toContain('img.png')
    }
  })

  it('htmlToMarkdown errors on empty content', () => {
    const r = htmlToMarkdown('<html><body></body></html>', 'https://x.test')
    expect(r.ok).toBe(false)
  })

  it('fromUrl fetches, converts and ingests a web document', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sampleHtml, { status: 200 })))
    const r = await fromUrl(db, { url: 'https://example.com/a', folderId: null })
    expect(isOk(r)).toBe(true)
    if (isOk(r)) {
      expect(r.data.type).toBe('web')
      expect(r.data.sourceUrl).toBe('https://example.com/a')
      expect(r.data.contentText).toContain('meaningful paragraph')
    }
    const fts = db.prepare(`SELECT COUNT(*) AS n FROM documents_fts`).get() as { n: number }
    expect(fts.n).toBe(1)
  })

  it('fromUrl rejects an invalid url', async () => {
    const r = await fromUrl(db, { url: 'not a url', folderId: null })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('E_INVALID_URL')
  })

  it('fromUrl errors on non-ok HTTP and inserts no document', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    const r = await fromUrl(db, { url: 'https://example.com/missing', folderId: null })
    expect(r.ok).toBe(false)
    const n = db.prepare(`SELECT COUNT(*) AS n FROM documents`).get() as { n: number }
    expect(n.n).toBe(0)
  })
})
