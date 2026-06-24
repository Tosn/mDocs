import type Database from 'better-sqlite3'
import { randomUUID, createHash } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'
import { ok, err, isOk, type Result, type Document } from '@shared/types'

function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/** HTML → 正文 md（保留图片）。抽取失败/空 → 错误。可被普通爬取与登录爬取复用。 */
export function htmlToMarkdown(
  html: string,
  url: string
): Result<{ title: string; markdown: string }> {
  let doc: Document_ | null = null
  try {
    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    doc = reader.parse() as Document_ | null
  } catch (e) {
    return err('E_PARSE_WEB', `网页解析失败：${(e as Error).message}`)
  }
  if (!doc || !doc.content) return err('E_EMPTY', '未能从网页抽取正文')

  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
  const markdown = td.turndown(doc.content).trim()
  if (!markdown) return err('E_EMPTY', '网页正文为空')

  return ok({ title: (doc.title || url).trim(), markdown })
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
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) return err('E_HTTP', `请求失败：HTTP ${res.status}`)
    const html = await res.text()
    if (!html.trim()) return err('E_EMPTY', '网页内容为空')
    return ok(html)
  } catch (e) {
    return err('E_FETCH', `无法访问该链接：${(e as Error).message}`)
  }
}

/** 把网页 md 入库为 web 文档（保留原链接）。供 fromUrl 与登录爬取复用。 */
export function ingestWebDoc(
  db: Database.Database,
  input: { html: string; url: string; folderId: string | null; storageDir?: string }
): Result<Document> {
  const conv = htmlToMarkdown(input.html, input.url)
  if (!isOk(conv)) return err(conv.error.code, conv.error.message)

  const md = conv.data.markdown
  const name = conv.data.title || input.url
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
