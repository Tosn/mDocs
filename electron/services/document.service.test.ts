import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../db/index'
import {
  createDoc,
  updateContent,
  renameDoc,
  moveDoc,
  deleteDoc,
  upload,
  importFolder,
  uniqueName
} from './document.service'
import { isOk, isErr } from '@shared/types'

let db: Database.Database
let work: string
let storage: string

beforeEach(() => {
  db = openDb(':memory:')
  work = mkdtempSync(join(tmpdir(), 'mdocs-'))
  storage = join(work, 'store')
  mkdirSync(storage)
})
afterEach(() => {
  db.close()
  rmSync(work, { recursive: true, force: true })
})

describe('document.service', () => {
  it('moveDoc moves a document into a target folder', () => {
    const doc = createDoc(db, { name: 'm', folderId: null, contentText: 'x' })
    if (!isOk(doc)) throw new Error('setup')
    db.prepare(
      `INSERT INTO folders (id, name, parent_id, created_at, updated_at, deleted_at) VALUES ('fold','Box',NULL,0,0,NULL)`
    ).run()
    const r = moveDoc(db, doc.data.id, 'fold')
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data.folderId).toBe('fold')
  })

  it('moveDoc auto-numbers on name conflict in the target folder', () => {
    db.prepare(
      `INSERT INTO folders (id, name, parent_id, created_at, updated_at, deleted_at) VALUES ('fold','Box',NULL,0,0,NULL)`
    ).run()
    createDoc(db, { name: 'dup', folderId: 'fold', contentText: 'a' })
    const doc = createDoc(db, { name: 'dup', folderId: null, contentText: 'b' })
    if (!isOk(doc)) throw new Error('setup')
    const r = moveDoc(db, doc.data.id, 'fold')
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data.name).toBe('dup (1)')
  })

  it('createDoc inserts with content hash and md type', () => {
    const r = createDoc(db, { name: 'note', folderId: null, contentText: 'hello' })
    expect(isOk(r)).toBe(true)
    if (isOk(r)) {
      expect(r.data.name).toBe('note')
      expect(r.data.type).toBe('md')
      expect(r.data.contentHash.length).toBeGreaterThan(0)
    }
  })

  it('updateContent updates text, changes hash, resets index', () => {
    const c = createDoc(db, { name: 'n', folderId: null, contentText: 'a' })
    if (!isOk(c)) throw new Error('setup failed')
    const r = updateContent(db, c.data.id, 'b')
    expect(isOk(r)).toBe(true)
    if (isOk(r)) {
      expect(r.data.contentText).toBe('b')
      expect(r.data.indexedAt).toBeNull()
      expect(r.data.contentHash).not.toBe(c.data.contentHash)
    }
  })

  it('uniqueName appends an incrementing suffix on collisions', () => {
    expect(uniqueName(db, null, 'a')).toBe('a')
    createDoc(db, { name: 'a', folderId: null, contentText: 'x' })
    expect(uniqueName(db, null, 'a')).toBe('a (1)')
    createDoc(db, { name: 'a (1)', folderId: null, contentText: 'y' })
    expect(uniqueName(db, null, 'a')).toBe('a (2)')
  })

  it('renameDoc rejects duplicate in same folder', () => {
    createDoc(db, { name: 'a', folderId: null, contentText: 'x' })
    const b = createDoc(db, { name: 'b', folderId: null, contentText: 'y' })
    if (!isOk(b)) throw new Error('setup failed')
    expect(isErr(renameDoc(db, b.data.id, 'a'))).toBe(true)
  })

  it('deleteDoc moves the doc to trash', () => {
    const c = createDoc(db, { name: 'n', folderId: null, contentText: 'x' })
    if (!isOk(c)) throw new Error('setup failed')
    expect(isOk(deleteDoc(db, c.data.id))).toBe(true)
    const trash = db.prepare(`SELECT * FROM trash_items WHERE item_type='document'`).all()
    expect(trash.length).toBe(1)
  })

  it('upload imports supported files and skips unsupported', async () => {
    const md = join(work, 'a.md')
    const txt = join(work, 'b.txt')
    const bad = join(work, 'c.xls')
    writeFileSync(md, '# A\nbody')
    writeFileSync(txt, 'plain')
    writeFileSync(bad, 'nope')

    const r = await upload(db, { paths: [md, txt, bad], folderId: null, storageDir: storage })
    expect(isOk(r)).toBe(true)
    if (isOk(r)) {
      expect(r.data.added.length).toBe(2)
      expect(r.data.skipped.length).toBe(1)
      expect(r.data.skipped[0].path).toBe(bad)
    }
  })

  it('upload accepts a folder path and recurses its contents', async () => {
    const nested = join(work, 'docs', 'nested')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(work, 'docs', 'top.md'), '# top')
    writeFileSync(join(nested, 'deep.txt'), 'deep')

    const r = await upload(db, { paths: [join(work, 'docs')], folderId: null, storageDir: storage })
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data.added.length).toBe(2)
  })

  it('importFolder reports added / skipped counts', async () => {
    const dir = join(work, 'imp')
    mkdirSync(dir)
    writeFileSync(join(dir, 'a.md'), '# a')
    writeFileSync(join(dir, 'bad.bin'), 'x')

    const r = await importFolder(db, { dirPath: dir, folderId: null, storageDir: storage })
    expect(isOk(r)).toBe(true)
    if (isOk(r)) {
      expect(r.data.added).toBe(1)
      expect(r.data.skipped).toBe(1)
    }
  })
})
