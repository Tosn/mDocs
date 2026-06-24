import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openDb } from '../db/index'
import { createFolder, deleteFolder } from './folder.service'
import { createDoc, deleteDoc } from './document.service'
import { listTrash, restoreTrash, purgeTrash } from './trash.service'
import { isOk } from '@shared/types'

let db: Database.Database
beforeEach(() => {
  db = openDb(':memory:')
})
afterEach(() => db.close())

describe('trash.service', () => {
  it('lists trashed items enriched with name', () => {
    const f = createFolder(db, { name: 'F', parentId: null })
    if (!isOk(f)) throw new Error('setup')
    deleteFolder(db, f.data.id)
    const d = createDoc(db, { name: 'D', folderId: null, contentText: 'x' })
    if (!isOk(d)) throw new Error('setup')
    deleteDoc(db, d.data.id)

    const r = listTrash(db)
    expect(isOk(r)).toBe(true)
    if (isOk(r)) {
      expect(r.data.length).toBe(2)
      expect(r.data.map((e) => e.name).sort()).toEqual(['D', 'F'])
    }
  })

  it('restores a document to its original folder', () => {
    const f = createFolder(db, { name: 'F', parentId: null })
    if (!isOk(f)) throw new Error('setup')
    const d = createDoc(db, { name: 'D', folderId: f.data.id, contentText: 'hello world' })
    if (!isOk(d)) throw new Error('setup')
    deleteDoc(db, d.data.id)

    const trash = listTrash(db)
    if (!isOk(trash)) throw new Error('setup')
    const entry = trash.data.find((e) => e.itemId === d.data.id)!

    const r = restoreTrash(db, entry.id)
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data.movedToRoot).toBe(false)

    const doc = db.prepare(`SELECT deleted_at, folder_id FROM documents WHERE id=?`).get(d.data.id) as {
      deleted_at: number | null
      folder_id: string | null
    }
    expect(doc.deleted_at).toBeNull()
    expect(doc.folder_id).toBe(f.data.id)

    const left = db.prepare(`SELECT COUNT(*) AS n FROM trash_items`).get() as { n: number }
    expect(left.n).toBe(0)
  })

  it('restores to root when the original parent is gone', () => {
    const f = createFolder(db, { name: 'F', parentId: null })
    if (!isOk(f)) throw new Error('setup')
    const d = createDoc(db, { name: 'D', folderId: f.data.id, contentText: 'x' })
    if (!isOk(d)) throw new Error('setup')
    deleteDoc(db, d.data.id)
    db.prepare(`DELETE FROM folders WHERE id=?`).run(f.data.id)

    const trash = listTrash(db)
    if (!isOk(trash)) throw new Error('setup')
    const entry = trash.data.find((e) => e.itemId === d.data.id)!

    const r = restoreTrash(db, entry.id)
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data.movedToRoot).toBe(true)

    const doc = db.prepare(`SELECT folder_id FROM documents WHERE id=?`).get(d.data.id) as {
      folder_id: string | null
    }
    expect(doc.folder_id).toBeNull()
  })

  it('restores a folder together with its descendants', () => {
    const root = createFolder(db, { name: 'root', parentId: null })
    if (!isOk(root)) throw new Error('setup')
    const child = createFolder(db, { name: 'child', parentId: root.data.id })
    if (!isOk(child)) throw new Error('setup')
    const d = createDoc(db, { name: 'inside', folderId: child.data.id, contentText: 'y' })
    if (!isOk(d)) throw new Error('setup')
    deleteFolder(db, root.data.id)

    const trash = listTrash(db)
    if (!isOk(trash)) throw new Error('setup')
    const entry = trash.data.find((e) => e.itemId === root.data.id)!
    restoreTrash(db, entry.id)

    const cf = db.prepare(`SELECT deleted_at FROM folders WHERE id=?`).get(child.data.id) as {
      deleted_at: number | null
    }
    const dd = db.prepare(`SELECT deleted_at FROM documents WHERE id=?`).get(d.data.id) as {
      deleted_at: number | null
    }
    expect(cf.deleted_at).toBeNull()
    expect(dd.deleted_at).toBeNull()
  })

  it('purge permanently removes the item and its trash entry', () => {
    const d = createDoc(db, { name: 'D', folderId: null, contentText: 'x' })
    if (!isOk(d)) throw new Error('setup')
    deleteDoc(db, d.data.id)
    const trash = listTrash(db)
    if (!isOk(trash)) throw new Error('setup')

    const r = purgeTrash(db, trash.data[0].id)
    expect(isOk(r)).toBe(true)

    const doc = db.prepare(`SELECT COUNT(*) AS n FROM documents WHERE id=?`).get(d.data.id) as {
      n: number
    }
    const left = db.prepare(`SELECT COUNT(*) AS n FROM trash_items`).get() as { n: number }
    expect(doc.n).toBe(0)
    expect(left.n).toBe(0)
  })
})
