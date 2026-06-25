import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openDb } from '../db/index'
import {
  createFolder,
  listFolders,
  buildTree,
  renameFolder,
  deleteFolder
} from './folder.service'
import { isOk, isErr } from '@shared/types'

let db: Database.Database
beforeEach(() => {
  db = openDb(':memory:')
})
afterEach(() => db.close())

describe('folder.service', () => {
  it('creates a folder at root', () => {
    const r = createFolder(db, { name: 'Docs', parentId: null })
    expect(isOk(r)).toBe(true)
    if (isOk(r)) {
      expect(r.data.name).toBe('Docs')
      expect(r.data.parentId).toBeNull()
    }
  })

  it('buildTree reports the direct document count per folder', () => {
    const a = createFolder(db, { name: 'A', parentId: null })
    if (!isOk(a)) throw new Error('setup')
    const now = Date.now()
    const ins = db.prepare(
      `INSERT INTO documents (id, folder_id, name, type, file_path, source_url, content_text, content_hash, size, indexed_at, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, 'md', '', NULL, '', 'h', 0, NULL, ?, ?, NULL)`
    )
    ins.run('d1', a.data.id, 'one', now, now)
    ins.run('d2', a.data.id, 'two', now, now)

    const roots = buildTree(db)
    if (!isOk(roots)) throw new Error('tree')
    expect(roots.data.find((n) => n.id === a.data.id)?.docCount).toBe(2)
  })

  it('lists folders by parent', () => {
    createFolder(db, { name: 'A', parentId: null })
    const b = createFolder(db, { name: 'B', parentId: null })
    if (!isOk(b)) throw new Error('setup failed')
    createFolder(db, { name: 'B1', parentId: b.data.id })

    const roots = listFolders(db, null)
    if (isOk(roots)) expect(roots.data.map((f) => f.name).sort()).toEqual(['A', 'B'])

    const children = listFolders(db, b.data.id)
    if (isOk(children)) expect(children.data.map((f) => f.name)).toEqual(['B1'])
  })

  it('rejects duplicate sibling name', () => {
    createFolder(db, { name: 'Dup', parentId: null })
    const r = createFolder(db, { name: 'Dup', parentId: null })
    expect(isErr(r)).toBe(true)
    if (isErr(r)) expect(r.error.code).toBe('E_DUPLICATE')
  })

  it('rejects empty and illegal names', () => {
    expect(isErr(createFolder(db, { name: '   ', parentId: null }))).toBe(true)
    expect(isErr(createFolder(db, { name: 'a/b', parentId: null }))).toBe(true)
  })

  it('renames a folder and rejects rename collision', () => {
    const a = createFolder(db, { name: 'A', parentId: null })
    createFolder(db, { name: 'B', parentId: null })
    if (!isOk(a)) throw new Error('setup failed')

    expect(isOk(renameFolder(db, a.data.id, 'A2'))).toBe(true)
    expect(isErr(renameFolder(db, a.data.id, 'B'))).toBe(true)
  })

  it('builds a nested tree', () => {
    const root = createFolder(db, { name: 'root', parentId: null })
    if (!isOk(root)) throw new Error('setup failed')
    createFolder(db, { name: 'child', parentId: root.data.id })

    const t = buildTree(db)
    expect(isOk(t)).toBe(true)
    if (isOk(t)) {
      const node = t.data.find((n) => n.name === 'root')
      expect(node?.children.map((c) => c.name)).toEqual(['child'])
    }
  })

  it('delete moves folder + descendants to trash', () => {
    const root = createFolder(db, { name: 'root', parentId: null })
    if (!isOk(root)) throw new Error('setup failed')
    createFolder(db, { name: 'child', parentId: root.data.id })

    expect(isOk(deleteFolder(db, root.data.id))).toBe(true)

    const roots = listFolders(db, null)
    if (isOk(roots)) expect(roots.data.find((f) => f.name === 'root')).toBeUndefined()

    const children = listFolders(db, root.data.id)
    if (isOk(children)) expect(children.data.length).toBe(0)

    const trash = db.prepare(`SELECT * FROM trash_items WHERE item_type='folder'`).all()
    expect(trash.length).toBe(1)
  })
})
