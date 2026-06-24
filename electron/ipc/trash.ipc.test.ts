import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openDb } from '../db/index'
import { CHANNELS } from '@shared/channels'
import { createDoc, deleteDoc } from '../services/document.service'
import { registerTrashIpc } from './trash.ipc'
import { isOk } from '@shared/types'

function fakeIpc() {
  const handlers = new Map<string, (e: unknown, ...a: unknown[]) => unknown>()
  return {
    handle: (c: string, fn: (e: unknown, ...a: unknown[]) => unknown) => handlers.set(c, fn),
    has: (c: string) => handlers.has(c),
    invoke: (c: string, ...args: unknown[]) => handlers.get(c)!({}, ...args)
  }
}

let db: Database.Database
let ipc: ReturnType<typeof fakeIpc>
beforeEach(() => {
  db = openDb(':memory:')
  ipc = fakeIpc()
  registerTrashIpc(ipc as never, db)
})
afterEach(() => db.close())

describe('trash.ipc', () => {
  it('registers all trash channels', () => {
    for (const c of Object.values(CHANNELS.trash)) expect(ipc.has(c)).toBe(true)
  })

  it('list then restore round-trips a deleted document', async () => {
    const d = createDoc(db, { name: 'D', folderId: null, contentText: 'x' })
    if (!isOk(d)) throw new Error('setup')
    deleteDoc(db, d.data.id)

    const list = (await ipc.invoke(CHANNELS.trash.list)) as { ok: boolean; data: { id: string }[] }
    expect(list.ok).toBe(true)
    expect(list.data.length).toBe(1)

    const restore = (await ipc.invoke(CHANNELS.trash.restore, list.data[0].id)) as { ok: boolean }
    expect(restore.ok).toBe(true)
  })
})
