import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openDb } from '../db/index'
import { createDoc, deleteDoc } from '../services/document.service'
import { purgeExpiredTrash } from './trash-gc'
import { isOk } from '@shared/types'

let db: Database.Database
beforeEach(() => {
  db = openDb(':memory:')
})
afterEach(() => db.close())

describe('purgeExpiredTrash', () => {
  it('purges items past purge_after and keeps fresh ones', () => {
    const a = createDoc(db, { name: 'a', folderId: null, contentText: 'x' })
    const b = createDoc(db, { name: 'b', folderId: null, contentText: 'y' })
    if (!isOk(a) || !isOk(b)) throw new Error('setup')
    deleteDoc(db, a.data.id)
    deleteDoc(db, b.data.id)

    // 让 b 的回收站项过期
    db.prepare(`UPDATE trash_items SET purge_after = ? WHERE item_id = ?`).run(Date.now() - 1000, b.data.id)

    const purged = purgeExpiredTrash(db)
    expect(purged).toBe(1)

    const trashLeft = db.prepare(`SELECT item_id FROM trash_items`).all() as { item_id: string }[]
    expect(trashLeft.map((t) => t.item_id)).toEqual([a.data.id])

    const bGone = db.prepare(`SELECT COUNT(*) AS n FROM documents WHERE id = ?`).get(b.data.id) as {
      n: number
    }
    expect(bGone.n).toBe(0)
  })

  it('returns 0 when nothing is expired', () => {
    const a = createDoc(db, { name: 'a', folderId: null, contentText: 'x' })
    if (!isOk(a)) throw new Error('setup')
    deleteDoc(db, a.data.id)
    expect(purgeExpiredTrash(db)).toBe(0)
  })
})
