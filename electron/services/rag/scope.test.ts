import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openDb } from '../../db/index'
import { createFolder } from '../folder.service'
import { createDoc, deleteDoc } from '../document.service'
import { resolveScope } from './scope'
import { isOk } from '@shared/types'

let db: Database.Database
beforeEach(() => {
  db = openDb(':memory:')
})
afterEach(() => db.close())

describe('resolveScope', () => {
  it('returns null when no scope (whole library)', () => {
    expect(resolveScope(db, undefined)).toBeNull()
    expect(resolveScope(db, {})).toBeNull()
    expect(resolveScope(db, { documentIds: [], folderIds: [] })).toBeNull()
  })

  it('returns the given document ids (valid only)', () => {
    const a = createDoc(db, { name: 'a', folderId: null, contentText: 'x' })
    const b = createDoc(db, { name: 'b', folderId: null, contentText: 'y' })
    if (!isOk(a) || !isOk(b)) throw new Error('setup')
    const ids = resolveScope(db, { documentIds: [a.data.id, b.data.id] })!
    expect(ids.sort()).toEqual([a.data.id, b.data.id].sort())
  })

  it('expands a folder recursively to its documents', () => {
    const root = createFolder(db, { name: 'root', parentId: null })
    if (!isOk(root)) throw new Error('setup')
    const child = createFolder(db, { name: 'child', parentId: root.data.id })
    if (!isOk(child)) throw new Error('setup')
    const d1 = createDoc(db, { name: 'd1', folderId: root.data.id, contentText: 'x' })
    const d2 = createDoc(db, { name: 'd2', folderId: child.data.id, contentText: 'y' })
    if (!isOk(d1) || !isOk(d2)) throw new Error('setup')

    const ids = resolveScope(db, { folderIds: [root.data.id] })!
    expect(ids.sort()).toEqual([d1.data.id, d2.data.id].sort())
  })

  it('excludes deleted documents from explicit ids', () => {
    const a = createDoc(db, { name: 'a', folderId: null, contentText: 'x' })
    const b = createDoc(db, { name: 'b', folderId: null, contentText: 'y' })
    if (!isOk(a) || !isOk(b)) throw new Error('setup')
    deleteDoc(db, b.data.id)
    const ids = resolveScope(db, { documentIds: [a.data.id, b.data.id] })!
    expect(ids).toEqual([a.data.id])
  })

  it('returns empty array when scope given but resolves to nothing', () => {
    const ids = resolveScope(db, { folderIds: ['nonexistent'] })!
    expect(ids).toEqual([])
  })
})
