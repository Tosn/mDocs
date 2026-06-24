import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openDb } from '../db/index'
import { CHANNELS } from '@shared/channels'
import { registerFolderIpc } from './folder.ipc'

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
  registerFolderIpc(ipc as never, db)
})
afterEach(() => db.close())

describe('folder.ipc', () => {
  it('registers all folder channels', () => {
    for (const c of Object.values(CHANNELS.folder)) expect(ipc.has(c)).toBe(true)
  })

  it('create handler creates a folder and returns Result', async () => {
    const r = (await ipc.invoke(CHANNELS.folder.create, { name: 'F', parentId: null })) as {
      ok: boolean
    }
    expect(r.ok).toBe(true)
  })

  it('list handler returns folders', async () => {
    await ipc.invoke(CHANNELS.folder.create, { name: 'A', parentId: null })
    const r = (await ipc.invoke(CHANNELS.folder.list, null)) as { ok: boolean; data: unknown[] }
    expect(r.ok).toBe(true)
    expect(r.data.length).toBe(1)
  })
})
