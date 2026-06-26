import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { migration001, type Migration } from './migrations/001_init'
import { vecSql, EMBEDDING_DIM } from './schema'

// 已注册的迁移，按 version 升序执行。
const migrations: Migration[] = [migration001]

/**
 * 打开数据库连接：加载 sqlite-vec 扩展、执行迁移、建立向量表。
 * @param filename SQLite 文件路径；默认 ':memory:' 便于测试。
 */
export function openDb(filename = ':memory:'): Database.Database {
  const db = new Database(filename)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // 加载向量扩展（chunk_vec 依赖它）。
  // sqlite-vec 是原生扩展，loadExtension 走原生 dlopen，不经 Electron 的 asar 重定向；
  // 打包后必须把 app.asar 路径换成 app.asar.unpacked 的真实路径（配合 asarUnpack）。
  const extPath = sqliteVec.getLoadablePath().replace('app.asar', 'app.asar.unpacked')
  db.loadExtension(extPath)

  runMigrations(db)

  // 向量表需扩展就绪后创建。
  db.exec(vecSql(EMBEDDING_DIM))

  return db
}

/** 幂等执行尚未应用的迁移，并记录版本。 */
export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `)

  const applied = new Set(
    db
      .prepare(`SELECT version FROM schema_migrations`)
      .all()
      .map((r) => (r as { version: number }).version)
  )

  const record = db.prepare(
    `INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`
  )

  const run = db.transaction(() => {
    for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
      if (applied.has(m.version)) continue
      m.up(db)
      record.run(m.version, m.name, Date.now())
    }
  })

  run()
}
