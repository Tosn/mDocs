import type Database from 'better-sqlite3'
import { randomUUID, createHash } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { ok, err, isOk, type Result, type Document } from '@shared/types'
import { uniqueName } from './document.service'

// 浏览器式请求头：缺少 UA 会被知乎等站点直接 403。
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
}

function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/**
 * 给无表头的表格补表头：turndown-plugin-gfm 仅转换「首行为表头行」的表格，
 * 而真实网页表格首行常是 <td>，会被原样留成 HTML；且 Readability 会把无表头
 * 表格当作版式噪声删除。故须在 Readability 抽取之前，把这类表格首行的 <td>
 * 提升为 <th>——既让 Readability 保留它，又能转成 GFM 管道表格。已含 <th> 的
 * 表格保持不变。入参/返回均为整页 HTML。
 */
// jsdom 无类型声明（any）；用最小结构类型约束本函数用到的 DOM 操作。
interface ElLike {
  tagName: string
  innerHTML: string
  children: ArrayLike<ElLike>
  querySelector(sel: string): ElLike | null
  replaceWith(node: ElLike): void
}
interface DocLike {
  querySelectorAll(sel: string): ArrayLike<ElLike>
  createElement(tag: string): ElLike
}

export function promoteTableHeaders(html: string): string {
  try {
    const dom = new JSDOM(html)
    const doc = dom.window.document as DocLike
    for (const table of Array.from(doc.querySelectorAll('table'))) {
      if (table.querySelector('th')) continue
      const firstRow = table.querySelector('tr')
      if (!firstRow) continue
      for (const cell of Array.from(firstRow.children)) {
        if (cell.tagName === 'TD') {
          const th = doc.createElement('th')
          th.innerHTML = cell.innerHTML
          cell.replaceWith(th)
        }
      }
    }
    return dom.serialize()
  } catch {
    return html
  }
}

/** HTML → 正文 md（保留图片）。抽取失败/空 → 错误。可被普通爬取与登录爬取复用。 */
export function htmlToMarkdown(
  html: string,
  url: string
): Result<{ title: string; markdown: string }> {
  let contentHtml = ''
  let title = url
  let bodyHtml = ''
  try {
    const dom = new JSDOM(promoteTableHeaders(html), { url })
    // 移除非正文噪声（图标 SVG / 脚本 / 样式），减少飞书等富文档转出的杂质。
    dom.window.document
      .querySelectorAll('svg, script, style, noscript')
      .forEach((el: { remove: () => void }) => el.remove())
    // Readability 会改写 DOM，先存一份 body 作为兜底（飞书等 SPA 的编辑器 DOM
    // 常被 Readability 误判为噪声整段丢弃，此时回退到 body 至少保住正文）。
    bodyHtml = (dom.window.document.body as { innerHTML?: string } | null)?.innerHTML ?? ''
    title = dom.window.document.title || url
    const doc = new Readability(dom.window.document).parse() as Document_ | null
    if (doc?.content) {
      contentHtml = doc.content
      title = (doc.title || title).trim()
    }
  } catch (e) {
    return err('E_PARSE_WEB', `网页解析失败：${(e as Error).message}`)
  }

  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
  td.use(gfm) // 表格 → GFM 管道表格，并支持删除线/任务列表
  let markdown = contentHtml ? td.turndown(contentHtml).trim() : ''
  // Readability 抽取为空/过短：回退到整页 body（噪声更多，但不至于整段丢内容）。
  if (markdown.length < 50 && bodyHtml) {
    const fallback = td.turndown(bodyHtml).trim()
    if (fallback.length > markdown.length) markdown = fallback
  }
  if (!markdown) return err('E_EMPTY', '网页正文为空')

  return ok({ title: title.trim(), markdown })
}

// Readability.parse() 的最小返回形状。
interface Document_ {
  title: string | null
  content: string | null
}

/** 抓取 URL 的 HTML（普通无登录场景）。校验协议、HTTP 状态、空内容。 */
export async function fetchHtml(url: string): Promise<Result<string>> {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return err('E_INVALID_URL', '无效的链接')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return err('E_INVALID_URL', '仅支持 http/https 链接')
  }
  try {
    const res = await fetch(url, { redirect: 'follow', headers: BROWSER_HEADERS })
    if (!res.ok) {
      const hint =
        res.status === 401 || res.status === 403
          ? '；该站点可能需要登录或有反爬，请尝试用「需要登录？用浏览器打开后抓取」'
          : ''
      return err('E_HTTP', `请求失败：HTTP ${res.status}${hint}`)
    }
    const html = await res.text()
    if (!html.trim()) return err('E_EMPTY', '网页内容为空')
    return ok(html)
  } catch (e) {
    return err('E_FETCH', `无法访问该链接：${(e as Error).message}`)
  }
}

/** 把网页 md 入库为 web 文档（保留原链接）。供 fromUrl 与登录爬取复用。 */
// ── 飞书文档专用抽取（其结构是 .docx-*-block + .ace-line，Readability 抽不好） ──

/** 飞书/Lark 文档链接判定。 */
export function isFeishuUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname
    return /(^|\.)feishu\.(cn|net)$/.test(h) || /(^|\.)larksuite\.com$/.test(h)
  } catch {
    return false
  }
}

const ZERO_WIDTH = /[​‌‍﻿]/g

interface FNode {
  getAttribute(n: string): string | null
  textContent: string | null
  querySelectorAll(s: string): ArrayLike<FNode>
  closest(s: string): FNode | null
}

/** 取一个块内的可见文本：拼接 .ace-line，去零宽字符。 */
function aceText(el: FNode): string {
  const lines: string[] = []
  for (const line of Array.from(el.querySelectorAll('.ace-line'))) {
    lines.push((line.textContent ?? '').replace(ZERO_WIDTH, '').trim())
  }
  return lines.join('\n').trim()
}

/** 飞书表格 → GFM 管道表格（表头表与表体表被拆成两个 <table>，DOM 顺序即「表头+数据」）。 */
function feishuTable(tableBlock: FNode): string {
  const rows: string[][] = []
  for (const tr of Array.from(tableBlock.querySelectorAll('tr'))) {
    const cells = Array.from(tr.querySelectorAll('td')).map((td) =>
      aceText(td).replace(/\s*\n+\s*/g, ' ').replace(/\|/g, '\\|').trim()
    )
    if (cells.length) rows.push(cells)
  }
  if (rows.length === 0) return ''
  const cols = Math.max(...rows.map((r) => r.length))
  const pad = (r: string[]) => {
    const c = r.slice()
    while (c.length < cols) c.push('')
    return c
  }
  const line = (r: string[]) => `| ${r.join(' | ')} |`
  return [
    line(pad(rows[0])),
    line(new Array(cols).fill('---')),
    ...rows.slice(1).map((r) => line(pad(r)))
  ].join('\n')
}

/** 飞书文档 HTML → Markdown：按块类型解析标题/正文/表格/列表等。 */
export function feishuToMarkdown(
  html: string,
  url: string
): Result<{ title: string; markdown: string }> {
  let doc: { querySelectorAll(s: string): ArrayLike<FNode>; title?: string }
  try {
    doc = new JSDOM(html, { url }).window.document as never
  } catch (e) {
    return err('E_PARSE_WEB', `网页解析失败：${(e as Error).message}`)
  }

  // 顶层内容块：排除表格单元格内部的块（表格整体单独处理）。
  const blocks = Array.from(doc.querySelectorAll('.block[data-block-type]')).filter(
    (b) => !b.closest('[data-block-type="table_cell"]')
  )

  const out: string[] = []
  for (const b of blocks) {
    const type = b.getAttribute('data-block-type')
    if (type === 'heading1') out.push(`# ${aceText(b)}`)
    else if (type === 'heading2') out.push(`## ${aceText(b)}`)
    else if (type === 'heading3') out.push(`### ${aceText(b)}`)
    else if (type === 'heading4' || type === 'heading5' || type === 'heading6')
      out.push(`#### ${aceText(b)}`)
    else if (type === 'table') {
      const t = feishuTable(b)
      if (t) out.push(t)
    } else if (type === 'ordered') {
      const t = aceText(b)
      if (t) out.push(`1. ${t}`)
    } else if (type === 'bullet') {
      const t = aceText(b)
      if (t) out.push(`- ${t}`)
    } else if (type === 'code') {
      const t = aceText(b)
      if (t) out.push('```\n' + t + '\n```')
    } else if (type === 'quote_container' || type === 'quote') {
      const t = aceText(b)
      if (t) out.push(t.split('\n').map((l) => `> ${l}`).join('\n'))
    } else {
      const t = aceText(b) // text / 其它块：取文本
      if (t) out.push(t)
    }
  }

  // 标题优先用 document.title（飞书的文档名），其首个 heading1 多为章节标题。
  let title = (doc.title ?? '')
    .replace(/\s*[-|]\s*飞书[\s\S]*$/, '')
    .replace(/\s*-\s*(Feishu|Lark)[\s\S]*$/i, '')
    .trim()
  if (!title) {
    const h1 = blocks.find((b) => b.getAttribute('data-block-type') === 'heading1')
    if (h1) title = aceText(h1)
  }
  if (!title) title = url

  const markdown = out
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim()
  if (!markdown) return err('E_EMPTY', '未能从飞书文档抽取正文')
  return ok({ title, markdown })
}

export function ingestWebDoc(
  db: Database.Database,
  input: {
    html: string
    url: string
    folderId: string | null
    storageDir?: string
    /** 动态爬取（飞书式结构化抽取）；省略时按 URL 自动判定飞书。 */
    dynamic?: boolean
  }
): Result<Document> {
  // 解析方式：dynamic 显式指定优先（true=飞书式结构化，false=通用 Readability）；
  // 未指定时按 URL 自动判定飞书。
  const useFeishu = input.dynamic ?? isFeishuUrl(input.url)
  let conv = useFeishu
    ? feishuToMarkdown(input.html, input.url)
    : htmlToMarkdown(input.html, input.url)
  // 动态模式但页面非飞书结构（抽取失败）：回退通用 Readability，保证动态爬取对其他动态页也可用。
  if (useFeishu && !isOk(conv)) conv = htmlToMarkdown(input.html, input.url)
  if (!isOk(conv)) return err(conv.error.code, conv.error.message)

  const md = conv.data.markdown
  // 同级重名时自动编号（名称 (1)、(2)…），守住「同文件夹不重名」不变量。
  const name = uniqueName(db, input.folderId, conv.data.title || input.url)
  const now = Date.now()

  let filePath = ''
  if (input.storageDir) {
    try {
      mkdirSync(input.storageDir, { recursive: true })
      filePath = join(input.storageDir, `${randomUUID()}.md`)
      writeFileSync(filePath, md, 'utf-8')
    } catch {
      filePath = ''
    }
  }

  const doc: Document = {
    id: randomUUID(),
    folderId: input.folderId,
    name,
    type: 'web',
    filePath,
    sourceUrl: input.url,
    contentText: md,
    contentHash: hash(md),
    size: Buffer.byteLength(md),
    indexedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  }

  db.prepare(
    `INSERT INTO documents
       (id, folder_id, name, type, file_path, source_url, content_text, content_hash, size, indexed_at, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    doc.id,
    doc.folderId,
    doc.name,
    doc.type,
    doc.filePath,
    doc.sourceUrl,
    doc.contentText,
    doc.contentHash,
    doc.size,
    doc.indexedAt,
    doc.createdAt,
    doc.updatedAt,
    doc.deletedAt
  )
  db.prepare(`INSERT INTO documents_fts (document_id, name, content_text) VALUES (?, ?, ?)`).run(
    doc.id,
    doc.name,
    doc.contentText
  )

  return ok(doc)
}

/** 普通网页爬取入库（A4）：抓取→抽正文→md→入库；失败返回明确 error.code，不落空文档。 */
export async function fromUrl(
  db: Database.Database,
  input: { url: string; folderId: string | null; storageDir?: string }
): Promise<Result<Document>> {
  const html = await fetchHtml(input.url)
  if (!isOk(html)) return err(html.error.code, html.error.message)
  return ingestWebDoc(db, {
    html: html.data,
    url: input.url,
    folderId: input.folderId,
    storageDir: input.storageDir
  })
}
