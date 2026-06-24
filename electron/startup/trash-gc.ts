import type Database from 'better-sqlite3'
import { purgeTrash } from '../services/trash.service'

/**
 * 启动时回收站 GC（spec B3）：彻底删除 purge_after 已到期的项。
 * 返回清理的条目数。
 */
export function purgeExpiredTrash(db: Database.Database, now = Date.now()): number {
  const rows = db
    .prepare(`SELECT id FROM trash_items WHERE purge_after <= ?`)
    .all(now) as { id: string }[]
  let purged = 0
  for (const r of rows) {
    purgeTrash(db, r.id)
    purged += 1
  }
  return purged
}
