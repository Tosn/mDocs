import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { coreTablesSql, ftsSql, indexesSql } from './schema'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
})
afterEach(() => {
  db.close()
})

function namesOf(type: 'table' | 'index'): string[] {
  return db
    .prepare(`SELECT name FROM sqlite_master WHERE type = ?`)
    .all(type)
    .map((r) => (r as { name: string }).name)
}

describe('db schema', () => {
  it('creates all core tables', () => {
    db.exec(coreTablesSql)
    const tables = namesOf('table')
    for (const t of [
      'folders',
      'documents',
      'doc_chunks',
      'trash_items',
      'model_configs',
      'settings',
      'chat_sessions',
      'chat_messages',
      'message_sources'
    ]) {
      expect(tables).toContain(t)
    }
  })

  it('creates the FTS5 virtual table', () => {
    db.exec(coreTablesSql)
    db.exec(ftsSql)
    expect(namesOf('table')).toContain('documents_fts')
  })

  it('creates the expected indexes', () => {
    db.exec(coreTablesSql)
    db.exec(indexesSql)
    const idx = namesOf('index')
    for (const i of ['idx_folder_parent', 'idx_document_folder', 'idx_trash_purge']) {
      expect(idx).toContain(i)
    }
  })

  it('documents table has the planned columns', () => {
    db.exec(coreTablesSql)
    const cols = db
      .prepare(`PRAGMA table_info(documents)`)
      .all()
      .map((r) => (r as { name: string }).name)
    for (const c of ['id', 'folder_id', 'type', 'content_text', 'content_hash', 'indexed_at', 'deleted_at']) {
      expect(cols).toContain(c)
    }
  })
})
