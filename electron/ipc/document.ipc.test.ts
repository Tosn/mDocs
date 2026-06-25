import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { openDb } from '../db/index'
import { CHANNELS } from '@shared/channels'
import { registerDocumentIpc } from './document.ipc'

const { showOpenDialog } = vi.hoisted(() => ({
  showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['/a/b.md'] }))
}))
vi.mock('electron', () => ({ dialog: { showOpenDialog } }))

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

  it('suggestName returns an auto-numbered name on collision', async () => {
    await ipc.invoke(CHANNELS.document.createDoc, { name: 'dup', folderId: null, contentText: 'x' })
    const r = (await ipc.invoke(CHANNELS.document.suggestName, { name: 'dup', folderId: null })) as {
      ok: boolean
      data: string
    }
    expect(r.ok).toBe(true)
    expect(r.data).toBe('dup (1)')
  })

  it('pickPaths opens the native dialog and returns selected paths', async () => {
    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/a/b.md', '/a/c.txt'] })
    const r = (await ipc.invoke(CHANNELS.document.pickPaths, { directory: false })) as {
      ok: boolean
      data: string[]
    }
    expect(r.ok).toBe(true)
    expect(r.data).toEqual(['/a/b.md', '/a/c.txt'])
  })

  it('pickPaths returns empty array when cancelled', async () => {
    showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    const r = (await ipc.invoke(CHANNELS.document.pickPaths, {})) as { ok: boolean; data: string[] }
    expect(r.ok).toBe(true)
    expect(r.data).toEqual([])
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
