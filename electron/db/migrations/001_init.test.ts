import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migration001 } from './001_init'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
})
afterEach(() => {
  db.close()
})

function tableNames(): string[] {
  return db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
    .all()
    .map((r) => (r as { name: string }).name)
}

describe('migration 001 (init)', () => {
  it('is version 1', () => {
    expect(migration001.version).toBe(1)
    expect(migration001.name).toBe('init')
  })

  it('up() builds core schema + fts', () => {
    migration001.up(db)
    const tables = tableNames()
    expect(tables).toContain('folders')
    expect(tables).toContain('documents')
    expect(tables).toContain('documents_fts')
  })

  it('up() is idempotent (safe to re-run)', () => {
    migration001.up(db)
    expect(() => migration001.up(db)).not.toThrow()
  })
})
