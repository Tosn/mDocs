import type Database from 'better-sqlite3'
import { randomUUID, createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ok, err, type Result, type DocType } from '@shared/types'
import { uniqueName } from './document.service'

/** 可迁移的文档库导出包（单 JSON）：仅文件夹 + 文档（PDF 内嵌 base64），不含模型/会话。 */
export interface ExportBundle {
  version: 1
  exportedAt: number
  folders: { ref: string; name: string; parentRef: string | null }[]
  documents: {
    folderRef: string | null
    name: string
    type: DocType
    contentText: string
    sourceUrl: string | null
    pdfBase64?: string
  }[]
}

function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/** 导出整库（未删除的文件夹与文档）；PDF 读取原文件内嵌为 base64。 */
export function exportLibrary(db: Database.Database): Result<ExportBundle> {
  const folders = (
    db.prepare(`SELECT id, name, parent_id FROM folders WHERE deleted_at IS NULL`).all() as {
      id: string
      name: string
      parent_id: string | null
    }[]
  ).map((f) => ({ ref: f.id, name: f.name, parentRef: f.parent_id }))

  const rows = db
    .prepare(
      `SELECT folder_id, name, type, content_text, source_url, file_path
       FROM documents WHERE deleted_at IS NULL`
    )
    .all() as {
    folder_id: string | null
    name: string
    type: DocType
    content_text: string
    source_url: string | null
    file_path: string
  }[]

  const documents = rows.map((d) => {
    const base = {
      folderRef: d.folder_id,
      name: d.name,
      type: d.type,
      contentText: d.content_text,
      sourceUrl: d.source_url
    }
    if (d.type === 'pdf' && d.file_path) {
      try {
        return { ...base, pdfBase64: readFileSync(d.file_path).toString('base64') }
      } catch {
        return base
      }
    }
    return base
  })

  return ok({ version: 1, exportedAt: Date.now(), folders, documents })
}

/** 导入文档库：按层级重建文件夹、重建文档（PDF 落盘），文档标记为待索引。 */
export function importLibrary(
  db: Database.Database,
  bundle: ExportBundle,
  storageDir?: string
): Result<{ folders: number; documents: number }> {
  if (
    !bundle ||
    bundle.version !== 1 ||
    !Array.isArray(bundle.folders) ||
    !Array.isArray(bundle.documents)
  ) {
    return err('E_INVALID', '导入文件格式不正确')
  }

  const idMap = new Map<string, string>() // 原 ref → 新 folder id
  const refSet = new Set(bundle.folders.map((f) => f.ref))
  const now = Date.now()

  const insertNode = (f: ExportBundle['folders'][number], newParentId: string | null) => {
    const newId = randomUUID()
    db.prepare(
      `INSERT INTO folders (id, name, parent_id, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)`
    ).run(newId, f.name, newParentId, now, now)
    idMap.set(f.ref, newId)
    for (const c of bundle.folders.filter((x) => x.parentRef === f.ref)) insertNode(c, newId)
  }

  const insChunk = db.prepare(
    `INSERT INTO documents (id, folder_id, name, type, file_path, source_url, content_text, content_hash, size, indexed_at, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`
  )
  const insFts = db.prepare(
    `INSERT INTO documents_fts (document_id, name, content_text) VALUES (?, ?, ?)`
  )

  let docCount = 0
  const tx = db.transaction(() => {
    // 根 = parentRef 为 null 或指向包外的文件夹。
    for (const f of bundle.folders.filter((x) => x.parentRef === null || !refSet.has(x.parentRef))) {
      insertNode(f, null)
    }
    for (const d of bundle.documents) {
      const targetFolder = d.folderRef !== null ? (idMap.get(d.folderRef) ?? null) : null
      const name = uniqueName(db, targetFolder, (d.name ?? '').trim() || '未命名')
      const id = randomUUID()
      let filePath = ''
      if (d.type === 'pdf' && d.pdfBase64 && storageDir) {
        try {
          mkdirSync(storageDir, { recursive: true })
          filePath = join(storageDir, `${id}.pdf`)
          writeFileSync(filePath, Buffer.from(d.pdfBase64, 'base64'))
        } catch {
          filePath = ''
        }
      }
      const text = d.contentText ?? ''
      insChunk.run(
        id,
        targetFolder,
        name,
        d.type,
        filePath,
        d.sourceUrl ?? null,
        text,
        hash(text),
        Buffer.byteLength(text),
        now,
        now
      )
      insFts.run(id, name, text)
      docCount += 1
    }
  })
  tx()

  return ok({ folders: bundle.folders.length, documents: docCount })
}
