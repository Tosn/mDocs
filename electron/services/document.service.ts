import type Database from 'better-sqlite3'
import { randomUUID, createHash } from 'node:crypto'
import { readFileSync, statSync, readdirSync, copyFileSync, mkdirSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import {
  ok,
  err,
  isOk,
  type Result,
  type Document,
  type DocType,
  type UploadReport,
  type ImportReport
} from '@shared/types'
import { parseByType } from './parse'
import { TRASH_RETENTION_MS } from './folder.service'

type ConflictPolicy = 'keepBoth' | 'overwrite' | 'cancel'

const EXT_TYPE: Record<string, DocType> = {
  '.md': 'md',
  '.markdown': 'md',
  '.txt': 'txt',
  '.pdf': 'pdf'
}

interface DocRow {
  id: string
  folder_id: string | null
  name: string
  type: DocType
  file_path: string
  source_url: string | null
  content_text: string
  content_hash: string
  size: number
  indexed_at: number | null
  created_at: number
  updated_at: number
  deleted_at: number | null
}

function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function rowToDoc(r: DocRow): Document {
  return {
    id: r.id,
    folderId: r.folder_id,
    name: r.name,
    type: r.type,
    filePath: r.file_path,
    sourceUrl: r.source_url,
    contentText: r.content_text,
    contentHash: r.content_hash,
    size: r.size,
    indexedAt: r.indexed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at
  }
}

function getDocRow(db: Database.Database, id: string): DocRow | undefined {
  return db.prepare(`SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL`).get(id) as
    | DocRow
    | undefined
}

function nameExists(
  db: Database.Database,
  folderId: string | null,
  name: string,
  excludeId: string | null = null
): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM documents
       WHERE deleted_at IS NULL AND name = ? AND folder_id IS ?
         AND (? IS NULL OR id != ?)
       LIMIT 1`
    )
    .get(name, folderId, excludeId, excludeId)
  return !!row
}

export function uniqueName(db: Database.Database, folderId: string | null, name: string): string {
  if (!nameExists(db, folderId, name)) return name
  const ext = extname(name)
  const base = ext ? name.slice(0, -ext.length) : name
  let k = 1
  let candidate = `${base} (${k})${ext}`
  while (nameExists(db, folderId, candidate)) {
    k += 1
    candidate = `${base} (${k})${ext}`
  }
  return candidate
}

function insertDoc(db: Database.Database, d: Document): void {
  db.prepare(
    `INSERT INTO documents
       (id, folder_id, name, type, file_path, source_url, content_text, content_hash, size, indexed_at, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    d.id,
    d.folderId,
    d.name,
    d.type,
    d.filePath,
    d.sourceUrl,
    d.contentText,
    d.contentHash,
    d.size,
    d.indexedAt,
    d.createdAt,
    d.updatedAt,
    d.deletedAt
  )
  db.prepare(`INSERT INTO documents_fts (document_id, name, content_text) VALUES (?, ?, ?)`).run(
    d.id,
    d.name,
    d.contentText
  )
}

export function createDoc(
  db: Database.Database,
  input: { name: string; folderId: string | null; contentText: string }
): Result<Document> {
  const name = (input.name ?? '').trim()
  if (!name) return err('E_INVALID_NAME', '名称不能为空')
  if (nameExists(db, input.folderId, name)) return err('E_DUPLICATE', '同级已存在同名文档')

  const now = Date.now()
  const text = input.contentText ?? ''
  const doc: Document = {
    id: randomUUID(),
    folderId: input.folderId,
    name,
    type: 'md',
    filePath: '',
    sourceUrl: null,
    contentText: text,
    contentHash: hash(text),
    size: Buffer.byteLength(text),
    indexedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  }
  insertDoc(db, doc)
  return ok(doc)
}

export function updateContent(
  db: Database.Database,
  id: string,
  contentText: string
): Result<Document> {
  const cur = getDocRow(db, id)
  if (!cur) return err('E_NOT_FOUND', '文档不存在')

  const now = Date.now()
  db.prepare(
    `UPDATE documents SET content_text = ?, content_hash = ?, size = ?, indexed_at = NULL, updated_at = ? WHERE id = ?`
  ).run(contentText, hash(contentText), Buffer.byteLength(contentText), now, id)
  db.prepare(`UPDATE documents_fts SET content_text = ? WHERE document_id = ?`).run(contentText, id)

  return ok(rowToDoc(getDocRow(db, id)!))
}

export function renameDoc(db: Database.Database, id: string, name: string): Result<Document> {
  const newName = (name ?? '').trim()
  if (!newName) return err('E_INVALID_NAME', '名称不能为空')
  const cur = getDocRow(db, id)
  if (!cur) return err('E_NOT_FOUND', '文档不存在')
  if (nameExists(db, cur.folder_id, newName, id)) return err('E_DUPLICATE', '同级已存在同名文档')

  const now = Date.now()
  db.prepare(`UPDATE documents SET name = ?, updated_at = ? WHERE id = ?`).run(newName, now, id)
  db.prepare(`UPDATE documents_fts SET name = ? WHERE document_id = ?`).run(newName, id)
  return ok(rowToDoc(getDocRow(db, id)!))
}

/** 移动文档到目标文件夹（folderId 为 null = 根/全部文档）；同名冲突自动编号。 */
export function moveDoc(
  db: Database.Database,
  id: string,
  folderId: string | null
): Result<Document> {
  const cur = getDocRow(db, id)
  if (!cur) return err('E_NOT_FOUND', '文档不存在')
  if (cur.folder_id === folderId) return ok(rowToDoc(cur))

  let name = cur.name
  if (nameExists(db, folderId, name, id)) name = uniqueName(db, folderId, name)

  const now = Date.now()
  db.prepare(`UPDATE documents SET folder_id = ?, name = ?, updated_at = ? WHERE id = ?`).run(
    folderId,
    name,
    now,
    id
  )
  if (name !== cur.name) {
    db.prepare(`UPDATE documents_fts SET name = ? WHERE document_id = ?`).run(name, id)
  }
  return ok(rowToDoc(getDocRow(db, id)!))
}

export function deleteDoc(db: Database.Database, id: string): Result<void> {
  const cur = getDocRow(db, id)
  if (!cur) return err('E_NOT_FOUND', '文档不存在')

  const now = Date.now()
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM documents_fts WHERE document_id = ?`).run(id)
    db.prepare(`UPDATE documents SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(now, now, id)
    db.prepare(
      `INSERT INTO trash_items (id, item_type, item_id, original_parent_id, deleted_at, purge_after)
       VALUES (?, 'document', ?, ?, ?, ?)`
    ).run(randomUUID(), id, cur.folder_id, now, now + TRASH_RETENTION_MS)
  })
  tx()
  return ok(undefined)
}

function expandPaths(paths: string[]): string[] {
  const out: string[] = []
  for (const p of paths) {
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      for (const entry of readdirSync(p)) out.push(...expandPaths([join(p, entry)]))
    } else {
      out.push(p)
    }
  }
  return out
}

async function addFromFile(
  db: Database.Database,
  filePath: string,
  type: DocType,
  folderId: string | null,
  storageDir: string | undefined,
  onConflict: ConflictPolicy
): Promise<Result<Document | null>> {
  let bytes: Buffer
  try {
    bytes = readFileSync(filePath)
  } catch (e) {
    return err('E_READ', `无法读取文件：${(e as Error).message}`)
  }

  const parsed = await parseByType(type, bytes)
  if (!isOk(parsed)) return err(parsed.error.code, parsed.error.message)

  let name = basename(filePath)
  if (nameExists(db, folderId, name)) {
    if (onConflict === 'cancel') return ok(null)
    if (onConflict === 'overwrite') {
      const existing = db
        .prepare(`SELECT id FROM documents WHERE deleted_at IS NULL AND name = ? AND folder_id IS ?`)
        .get(name, folderId) as { id: string } | undefined
      if (existing) {
        const updated = updateContent(db, existing.id, parsed.data)
        return isOk(updated) ? ok(updated.data) : err(updated.error.code, updated.error.message)
      }
    } else {
      name = uniqueName(db, folderId, name)
    }
  }

  let stored = ''
  if (storageDir) {
    try {
      mkdirSync(storageDir, { recursive: true })
      stored = join(storageDir, `${randomUUID()}${extname(filePath)}`)
      copyFileSync(filePath, stored)
    } catch {
      stored = ''
    }
  }

  let size: number
  try {
    size = statSync(filePath).size
  } catch {
    size = Buffer.byteLength(parsed.data)
  }

  const now = Date.now()
  const doc: Document = {
    id: randomUUID(),
    folderId,
    name,
    type,
    filePath: stored,
    sourceUrl: null,
    contentText: parsed.data,
    contentHash: hash(parsed.data),
    size,
    indexedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  }
  insertDoc(db, doc)
  return ok(doc)
}

/** 统一上传入口（spec A1）：paths 可为文件或文件夹，文件夹递归展开。 */
export async function upload(
  db: Database.Database,
  input: {
    paths: string[]
    folderId: string | null
    storageDir?: string
    onConflict?: ConflictPolicy
  }
): Promise<Result<UploadReport>> {
  const onConflict = input.onConflict ?? 'keepBoth'
  const added: Document[] = []
  const skipped: { path: string; reason: string }[] = []

  for (const file of expandPaths(input.paths)) {
    const type = EXT_TYPE[extname(file).toLowerCase()]
    if (!type) {
      skipped.push({ path: file, reason: '不支持的格式' })
      continue
    }
    const res = await addFromFile(db, file, type, input.folderId, input.storageDir, onConflict)
    if (isOk(res)) {
      if (res.data) added.push(res.data)
      else skipped.push({ path: file, reason: '已取消（同名冲突）' })
    } else {
      skipped.push({ path: file, reason: res.error.message })
    }
  }
  return ok({ added, skipped })
}

/** A2 文件夹批量导入：返回成功/跳过/失败计数。 */
export async function importFolder(
  db: Database.Database,
  input: { dirPath: string; folderId: string | null; storageDir?: string }
): Promise<Result<ImportReport>> {
  let added = 0
  let skipped = 0
  let failed = 0

  for (const file of expandPaths([input.dirPath])) {
    const type = EXT_TYPE[extname(file).toLowerCase()]
    if (!type) {
      skipped += 1
      continue
    }
    const res = await addFromFile(db, file, type, input.folderId, input.storageDir, 'keepBoth')
    if (isOk(res)) {
      if (res.data) added += 1
      else skipped += 1
    } else {
      failed += 1
    }
  }
  return ok({ added, skipped, failed })
}
