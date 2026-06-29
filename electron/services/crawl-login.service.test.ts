import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openDb } from '../db/index'
import { fromUrlInteractive, type InteractiveDeps } from './crawl-login.service'
import { isOk } from '@shared/types'

const sampleHtml = `<html><head><title>Member Page</title></head><body>
<article><h1>Member Page</h1>
<p>${'Authenticated content only visible after logging in to the site. '.repeat(10)}</p>
</article></body></html>`

let db: Database.Database
beforeEach(() => {
  db = openDb(':memory:')
})
afterEach(() => db.close())

describe('crawl-login.service (interactive)', () => {
  it('captures the logged-in page and ingests it as a web doc', async () => {
    const deps: InteractiveDeps = {
      capturePage: async (url) => ({ html: sampleHtml, finalUrl: url })
    }
    const r = await fromUrlInteractive(
      db,
      { url: 'https://site.test/member', folderId: null },
      deps
    )
    expect(isOk(r)).toBe(true)
    if (isOk(r)) {
      expect(r.data.type).toBe('web')
      expect(r.data.sourceUrl).toBe('https://site.test/member')
      expect(r.data.contentText).toContain('Authenticated content')
    }
    const n = db.prepare(`SELECT COUNT(*) AS n FROM documents`).get() as { n: number }
    expect(n.n).toBe(1)
  })

  it('returns a cancel error and ingests nothing when user cancels', async () => {
    const deps: InteractiveDeps = { capturePage: async () => null }
    const r = await fromUrlInteractive(db, { url: 'https://site.test/x', folderId: null }, deps)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('E_CANCELLED')
    const n = db.prepare(`SELECT COUNT(*) AS n FROM documents`).get() as { n: number }
    expect(n.n).toBe(0)
  })

  it('rejects an invalid url before opening the window', async () => {
    let opened = false
    const deps: InteractiveDeps = {
      capturePage: async () => {
        opened = true
        return null
      }
    }
    const r = await fromUrlInteractive(db, { url: 'not a url', folderId: null }, deps)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('E_INVALID_URL')
    expect(opened).toBe(false)
  })

  it('passes the dynamic flag to capturePage', async () => {
    let seenDynamic: boolean | undefined = undefined
    const deps: InteractiveDeps = {
      capturePage: async (_url, dynamic) => {
        seenDynamic = dynamic
        return { html: sampleHtml, finalUrl: 'https://site.test/x' }
      }
    }
    await fromUrlInteractive(db, { url: 'https://site.test/x', folderId: null, dynamic: true }, deps)
    expect(seenDynamic).toBe(true)
  })

  it('uses the final (post-redirect) url when provided', async () => {
    const deps: InteractiveDeps = {
      capturePage: async () => ({ html: sampleHtml, finalUrl: 'https://site.test/member/article-42' })
    }
    const r = await fromUrlInteractive(db, { url: 'https://site.test/login', folderId: null }, deps)
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data.sourceUrl).toBe('https://site.test/member/article-42')
  })
})
