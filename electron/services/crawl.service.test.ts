import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { openDb } from '../db/index'
import {
  htmlToMarkdown,
  fromUrl,
  promoteTableHeaders,
  ingestWebDoc,
  isFeishuUrl,
  feishuToMarkdown
} from './crawl.service'
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

  it('htmlToMarkdown converts header-less tables to GFM pipe tables', () => {
    // 真实网页常见：首行是 <td>，无 <thead>/<th>
    const tableHtml = `<html><head><title>T</title></head><body><article>
<h1>T</h1>
<p>${'Intro text about the data set and the methodology used here. '.repeat(12)}</p>
<table><tbody><tr><td>Name</td><td>Score</td></tr>
<tr><td>Alice</td><td>90</td></tr><tr><td>Bob</td><td>80</td></tr></tbody></table>
<p>${'Closing discussion of the results shown in the table above. '.repeat(12)}</p>
</article></body></html>`
    const r = htmlToMarkdown(tableHtml, 'https://x.test/t')
    expect(isOk(r)).toBe(true)
    if (isOk(r)) {
      expect(r.data.markdown).toContain('| Name |')
      expect(r.data.markdown).toMatch(/\| *--- *\|/)
      expect(r.data.markdown).toContain('Alice')
    }
  })

  it('promoteTableHeaders promotes the first row of a header-less table, idempotently', () => {
    const headerless = '<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr></tbody></table>'
    const promoted = promoteTableHeaders(headerless)
    expect(promoted).toContain('<th>A</th>')
    expect(promoted).toContain('<th>B</th>')
    expect(promoted).not.toContain('<td>A</td>')

    const withTh = '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>'
    expect(promoteTableHeaders(withTh)).not.toContain('<th>1</th>')
  })

  it('htmlToMarkdown falls back to body content for editor-style pages', () => {
    // 编辑器/SPA 式 DOM（无 article/p 结构），Readability 易整段抽空 → 回退 body 保住正文。
    const spa = `<html><body><div id="app"><div>${'飞书文档正文片段。'.repeat(30)}</div></div></body></html>`
    const r = htmlToMarkdown(spa, 'https://x.feishu.cn/docx/abc')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.markdown).toContain('飞书文档正文片段')
  })

  it('htmlToMarkdown errors on empty content', () => {
    const r = htmlToMarkdown('<html><body></body></html>', 'https://x.test')
    expect(r.ok).toBe(false)
  })

  it('isFeishuUrl detects feishu/lark doc links', () => {
    expect(isFeishuUrl('https://webeye.feishu.cn/docx/UbdQ')).toBe(true)
    expect(isFeishuUrl('https://x.larksuite.com/docx/abc')).toBe(true)
    expect(isFeishuUrl('https://zhuanlan.zhihu.com/p/1')).toBe(false)
    expect(isFeishuUrl('not a url')).toBe(false)
  })

  it('feishuToMarkdown parses blocks into headings/text/GFM tables', () => {
    const feishuHtml = `<html><head><title>埋点定义表 - 飞书云文档</title></head><body>
      <div class="page-block-children">
        <div class="block docx-heading1-block" data-block-type="heading1"><div class="ace-line"><span data-string="true">一.初始化链路</span><span data-enter="true">​</span></div></div>
        <div class="block docx-text-block" data-block-type="text"><div class="ace-line"><span data-string="true">具体字段：</span></div></div>
        <div class="block docx-table-block" data-block-type="table">
          <table class="sticky-row-wrapper"><tr class="first-row">
            <td data-block-type="table_cell"><div class="block docx-text-block" data-block-type="text"><div class="ace-line"><span data-string="true">指标名称</span></div></div></td>
            <td data-block-type="table_cell"><div class="ace-line"><span data-string="true">计算方式</span></div></td>
          </tr></table>
          <table class="table header-row"><tbody><tr>
            <td data-block-type="table_cell"><div class="ace-line"><span data-string="true">初始化次数</span></div></td>
            <td data-block-type="table_cell"><div class="ace-line"><span data-string="true">init_start 数</span></div></td>
          </tr></tbody></table>
        </div>
      </div></body></html>`
    const r = feishuToMarkdown(feishuHtml, 'https://x.feishu.cn/docx/abc')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.title).toBe('埋点定义表')
      expect(r.data.markdown).toContain('# 一.初始化链路')
      expect(r.data.markdown).toContain('具体字段：')
      expect(r.data.markdown).toContain('| 指标名称 | 计算方式 |')
      expect(r.data.markdown).toContain('| 初始化次数 | init_start 数 |')
    }
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

  it('fromUrl sends a browser User-Agent header', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => new Response(sampleHtml, { status: 200 }))
    vi.stubGlobal('fetch', f)
    await fromUrl(db, { url: 'https://example.com/a', folderId: null })
    const init = f.mock.calls[0][1] as { headers: Record<string, string> }
    expect(init.headers['User-Agent']).toMatch(/Mozilla/)
  })

  it('ingestWebDoc auto-numbers duplicate titles in the same folder', () => {
    const a = ingestWebDoc(db, { html: sampleHtml, url: 'https://example.com/a', folderId: null })
    const b = ingestWebDoc(db, { html: sampleHtml, url: 'https://example.com/b', folderId: null })
    expect(isOk(a)).toBe(true)
    expect(isOk(b)).toBe(true)
    if (isOk(a) && isOk(b)) {
      expect(a.data.name).toBe('My Article')
      expect(b.data.name).toBe('My Article (1)')
    }
    const n = db.prepare(`SELECT COUNT(*) AS n FROM documents`).get() as { n: number }
    expect(n.n).toBe(2)
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
