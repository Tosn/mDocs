import type Database from 'better-sqlite3'
import { unlinkSync } from 'node:fs'
import { ok, err, type Result } from '@shared/types'

export interface TrashEntry {
  id: string
  itemType: 'folder' | 'document'
  itemId: string
  name: string
  deletedAt: number
  purgeAfter: number
}

interface TrashRow {
  id: string
  item_type: 'folder' | 'document'
  item_id: string
  original_parent_id: string | null
  deleted_at: number
  purge_after: number
}

function getTrash(db: Database.Database, id: string): TrashRow | undefined {
  return db.prepare(`SELECT * FROM trash_items WHERE id = ?`).get(id) as TrashRow | undefined
}

function collectFolderSubtree(db: Database.Database, rootId: string): string[] {
  const out = [rootId]
  const queue = [rootId]
  const stmt = db.prepare(`SELECT id FROM folders WHERE parent_id = ?`)
  while (queue.length) {
    const cur = queue.shift()!
    for (const r of stmt.all(cur) as { id: string }[]) {
      out.push(r.id)
      queue.push(r.id)
    }
  }
  return out
}

function reAddFts(db: Database.Database, docId: string): void {
  const d = db.prepare(`SELECT name, content_text FROM documents WHERE id = ?`).get(docId) as
    | { name: string; content_text: string }
    | undefined
  if (!d) return
  db.prepare(`DELETE FROM documents_fts WHERE document_id = ?`).run(docId)
  db.prepare(`INSERT INTO documents_fts (document_id, name, content_text) VALUES (?, ?, ?)`).run(
    docId,
    d.name,
    d.content_text
  )
}

export function listTrash(db: Database.Database): Result<TrashEntry[]> {
  const rows = db.prepare(`SELECT * FROM trash_items ORDER BY deleted_at DESC`).all() as TrashRow[]
  const entries: TrashEntry[] = rows.map((r) => {
    const table = r.item_type === 'folder' ? 'folders' : 'documents'
    const found = db.prepare(`SELECT name FROM ${table} WHERE id = ?`).get(r.item_id) as
      | { name: string }
      | undefined
    return {
      id: r.id,
      itemType: r.item_type,
      itemId: r.item_id,
      name: found?.name ?? '(已删除)',
      deletedAt: r.deleted_at,
      purgeAfter: r.purge_after
    }
  })
  return ok(entries)
}

export function restoreTrash(
  db: Database.Database,
  trashId: string
): Result<{ movedToRoot: boolean }> {
  const entry = getTrash(db, trashId)
  if (!entry) return err('E_NOT_FOUND', '回收站条目不存在')

  const tx = db.transaction((): { movedToRoot: boolean; missing?: boolean } => {
    let movedToRoot = false
    const now = Date.now()

    if (entry.item_type === 'document') {
      const doc = db.prepare(`SELECT folder_id FROM documents WHERE id = ?`).get(entry.item_id) as
        | { folder_id: string | null }
        | undefined
      if (!doc) return { movedToRoot, missing: true }

      let folderId = doc.folder_id
      if (folderId) {
        const parent = db.prepare(`SELECT deleted_at FROM folders WHERE id = ?`).get(folderId) as
          | { deleted_at: number | null }
          | undefined
        if (!parent || parent.deleted_at != null) {
          folderId = null
          movedToRoot = true
        }
      }
      db.prepare(`UPDATE documents SET deleted_at = NULL, folder_id = ?, updated_at = ? WHERE id = ?`).run(
        folderId,
        now,
        entry.item_id
      )
      reAddFts(db, entry.item_id)
    } else {
      const folder = db.prepare(`SELECT parent_id FROM folders WHERE id = ?`).get(entry.item_id) as
        | { parent_id: string | null }
        | undefined
      if (!folder) return { movedToRoot, missing: true }

      let parentId = folder.parent_id
      if (parentId) {
        const parent = db.prepare(`SELECT deleted_at FROM folders WHERE id = ?`).get(parentId) as
          | { deleted_at: number | null }
          | undefined
        if (!parent || parent.deleted_at != null) {
          parentId = null
          movedToRoot = true
        }
      }

      const batch = entry.deleted_at
      for (const fid of collectFolderSubtree(db, entry.item_id)) {
        db.prepare(`UPDATE folders SET deleted_at = NULL WHERE id = ? AND deleted_at = ?`).run(fid, batch)
        const docs = db
          .prepare(`SELECT id FROM documents WHERE folder_id = ? AND deleted_at = ?`)
          .all(fid, batch) as { id: string }[]
        for (const dd of docs) {
          db.prepare(`UPDATE documents SET deleted_at = NULL WHERE id = ?`).run(dd.id)
          reAddFts(db, dd.id)
        }
      }
      db.prepare(`UPDATE folders SET parent_id = ?, updated_at = ? WHERE id = ?`).run(
        parentId,
        now,
        entry.item_id
      )
    }

    db.prepare(`DELETE FROM trash_items WHERE id = ?`).run(trashId)
    return { movedToRoot }
  })

  const res = tx()
  if (res.missing) return err('E_NOT_FOUND', '原对象已不存在')
  return ok({ movedToRoot: res.movedToRoot })
}

function purgeDocument(db: Database.Database, docId: string): void {
  const doc = db.prepare(`SELECT file_path FROM documents WHERE id = ?`).get(docId) as
    | { file_path: string }
    | undefined
  if (doc?.file_path) {
    try {
      unlinkSync(doc.file_path)
    } catch {
      /* best-effort */
    }
  }
  const chunks = db.prepare(`SELECT id FROM doc_chunks WHERE document_id = ?`).all(docId) as {
    id: string
  }[]
  for (const c of chunks) {
    try {
      db.prepare(`DELETE FROM chunk_vec WHERE chunk_id = ?`).run(c.id)
    } catch {
      /* vec table may be empty */
    }
  }
  db.prepare(`DELETE FROM doc_chunks WHERE document_id = ?`).run(docId)
  db.prepare(`DELETE FROM documents_fts WHERE document_id = ?`).run(docId)
  db.prepare(`DELETE FROM documents WHERE id = ?`).run(docId)
}

export function purgeTrash(db: Database.Database, trashId: string): Result<void> {
  const entry = getTrash(db, trashId)
  if (!entry) return err('E_NOT_FOUND', '回收站条目不存在')

  const tx = db.transaction(() => {
    if (entry.item_type === 'document') {
      purgeDocument(db, entry.item_id)
    } else {
      for (const fid of collectFolderSubtree(db, entry.item_id)) {
        const docs = db.prepare(`SELECT id FROM documents WHERE folder_id = ?`).all(fid) as {
          id: string
        }[]
        for (const dd of docs) purgeDocument(db, dd.id)
        db.prepare(`DELETE FROM folders WHERE id = ?`).run(fid)
      }
    }
    db.prepare(`DELETE FROM trash_items WHERE id = ?`).run(trashId)
  })
  tx()
  return ok(undefined)
}
