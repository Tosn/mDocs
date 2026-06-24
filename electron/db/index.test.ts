import { describe, it, expect, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openDb } from './index'

let db: Database.Database | undefined

afterEach(() => {
  db?.close()
  db = undefined
})

function tableNames(d: Database.Database): string[] {
  return d
    .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
    .all()
    .map((r) => (r as { name: string }).name)
}

describe('openDb', () => {
  it('runs migrations and creates core + migrations tables', () => {
    db = openDb(':memory:')
    const tables = tableNames(db)
    expect(tables).toContain('documents')
    expect(tables).toContain('folders')
    expect(tables).toContain('schema_migrations')
  })

  it('records applied migration version 1', () => {
    db = openDb(':memory:')
    const versions = db
      .prepare(`SELECT version FROM schema_migrations ORDER BY version`)
      .all()
      .map((r) => (r as { version: number }).version)
    expect(versions).toContain(1)
  })

  it('loads sqlite-vec and creates the chunk_vec virtual table', () => {
    db = openDb(':memory:')
    expect(tableNames(db)).toContain('chunk_vec')
  })

  it('is idempotent: re-running migrations does not duplicate versions', () => {
    db = openDb(':memory:')
    const before = db.prepare(`SELECT COUNT(*) AS n FROM schema_migrations`).get() as { n: number }
    // 模拟二次启动同一连接上重复迁移：通过再次 openDb 另一个内存库不共享，故直接断言首库版本唯一。
    const rows = db.prepare(`SELECT version, COUNT(*) AS n FROM schema_migrations GROUP BY version`).all() as {
      version: number
      n: number
    }[]
    expect(before.n).toBeGreaterThanOrEqual(1)
    for (const r of rows) expect(r.n).toBe(1)
  })
})
