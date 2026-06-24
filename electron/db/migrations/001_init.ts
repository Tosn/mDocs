import type Database from 'better-sqlite3'
import { coreTablesSql, ftsSql, indexesSql } from '../schema'

export interface Migration {
  version: number
  name: string
  up(db: Database.Database): void
}

// 首版迁移：建核心表、FTS5 虚拟表与索引。
// 注意：向量表 chunk_vec 需先加载 sqlite-vec 扩展，故由 db/index 的 openDb 负责，不在此迁移内。
export const migration001: Migration = {
  version: 1,
  name: 'init',
  up(db) {
    db.exec(coreTablesSql)
    db.exec(ftsSql)
    db.exec(indexesSql)
  }
}
