import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openDb } from '../db/index'
import { CHANNELS } from '@shared/channels'
import { createDoc } from '../services/document.service'
import { registerSearchIpc } from './search.ipc'

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
  registerSearchIpc(ipc as never, db)
})
afterEach(() => db.close())

describe('search.ipc', () => {
  it('registers the keyword channel', () => {
    expect(ipc.has(CHANNELS.search.keyword)).toBe(true)
  })

  it('keyword handler returns hits', async () => {
    createDoc(db, { name: 'a', folderId: null, contentText: 'quick brown fox' })
    const r = (await ipc.invoke(CHANNELS.search.keyword, { query: 'brown' })) as {
      ok: boolean
      data: unknown[]
    }
    expect(r.ok).toBe(true)
    expect(r.data.length).toBe(1)
  })
})
