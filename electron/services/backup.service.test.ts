import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openDb } from '../db/index'
import { isOk } from '@shared/types'
import { createDoc } from './document.service'
import { createFolder } from './folder.service'
import { exportLibrary, importLibrary } from './backup.service'

let db: Database.Database
beforeEach(() => {
  db = openDb(':memory:')
})
afterEach(() => db.close())

describe('backup.service', () => {
  it('exports then imports the library, preserving folders and documents', () => {
    const f = createFolder(db, { name: 'Box', parentId: null })
    if (!isOk(f)) throw new Error('setup')
    createDoc(db, { name: 'inbox', folderId: f.data.id, contentText: 'hello' })
    createDoc(db, { name: 'root-note', folderId: null, contentText: 'root' })

    const exp = exportLibrary(db)
    if (!isOk(exp)) throw new Error('export')
    expect(exp.data.folders.length).toBe(1)
    expect(exp.data.documents.length).toBe(2)

    // 导入到一个全新库 → 数量一致、层级保留。
    const db2 = openDb(':memory:')
    try {
      const imp = importLibrary(db2, exp.data)
      expect(isOk(imp)).toBe(true)
      if (isOk(imp)) {
        expect(imp.data.folders).toBe(1)
        expect(imp.data.documents).toBe(2)
      }
      const folderRow = db2.prepare(`SELECT id, name FROM folders`).get() as { id: string; name: string }
      expect(folderRow.name).toBe('Box')
      const inBox = db2
        .prepare(`SELECT name, content_text FROM documents WHERE folder_id = ?`)
        .get(folderRow.id) as { name: string; content_text: string }
      expect(inBox.name).toBe('inbox')
      expect(inBox.content_text).toBe('hello')
      // 导入文档待索引（indexed_at 为空）
      const pending = db2.prepare(`SELECT COUNT(*) AS n FROM documents WHERE indexed_at IS NULL`).get() as {
        n: number
      }
      expect(pending.n).toBe(2)
    } finally {
      db2.close()
    }
  })

  it('rejects an invalid bundle', () => {
    // @ts-expect-error 测试非法输入
    const r = importLibrary(db, { version: 2 })
    expect(isOk(r)).toBe(false)
  })
})
