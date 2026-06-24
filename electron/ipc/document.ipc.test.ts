import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openDb } from '../db/index'
import { CHANNELS } from '@shared/channels'
import { registerDocumentIpc } from './document.ipc'

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
  registerDocumentIpc(ipc as never, db, { storageDir: undefined })
})
afterEach(() => db.close())

describe('document.ipc', () => {
  it('registers all document channels', () => {
    for (const c of Object.values(CHANNELS.document)) expect(ipc.has(c)).toBe(true)
  })

  it('createDoc then listByFolder returns the document', async () => {
    const created = (await ipc.invoke(CHANNELS.document.createDoc, {
      name: 'n',
      folderId: null,
      contentText: 'x'
    })) as { ok: boolean }
    expect(created.ok).toBe(true)
    const list = (await ipc.invoke(CHANNELS.document.listByFolder, null)) as {
      ok: boolean
      data: unknown[]
    }
    expect(list.ok).toBe(true)
    expect(list.data.length).toBe(1)
  })

  it('get handler returns the document by id', async () => {
    const created = (await ipc.invoke(CHANNELS.document.createDoc, {
      name: 'n',
      folderId: null,
      contentText: 'hello'
    })) as { ok: true; data: { id: string } }
    const got = (await ipc.invoke(CHANNELS.document.get, created.data.id)) as {
      ok: boolean
      data: { contentText: string }
    }
    expect(got.ok).toBe(true)
    expect(got.data.contentText).toBe('hello')
  })
})
