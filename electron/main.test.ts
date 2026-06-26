import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'

// 屏蔽 electron 应用生命周期与原生依赖（仅测 bootstrap 纯逻辑）。
vi.hoisted(() => {
  process.env.NODE_ENV = 'test'
})
vi.mock('electron', () => ({
  app: { whenReady: vi.fn(() => new Promise(() => {})), on: vi.fn(), quit: vi.fn() },
  BrowserWindow: class {},
  ipcMain: { handle: vi.fn() },
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString()
  }
}))

import { bootstrap } from './main'
import { openDb } from './db/index'
import { CHANNELS } from '@shared/channels'
import { createDoc, deleteDoc } from './services/document.service'
import { isOk } from '@shared/types'

function fakeIpc() {
  const channels = new Set<string>()
  return {
    handle: (c: string) => channels.add(c),
    channels
  }
}

let db: Database.Database
beforeEach(() => {
  db = openDb(':memory:')
})
afterEach(() => db.close())

describe('main bootstrap', () => {
  it('registers IPC handlers for every domain channel', () => {
    const ipc = fakeIpc()
    bootstrap(ipc as never, db, {
      makeAskDeps: () => ({ embedQuery: async () => [], streamChat: async function* () {} })
    })
    const expected = [
      CHANNELS.folder.create,
      CHANNELS.document.upload,
      CHANNELS.search.keyword,
      CHANNELS.trash.list,
      CHANNELS.crawl.fromUrl,
      CHANNELS.crawl.fromUrlInteractive,
      CHANNELS.chat.ask,
      CHANNELS.settings.listModels,
      CHANNELS.backup.export
    ]
    for (const c of expected) expect(ipc.channels.has(c)).toBe(true)
  })

  it('runs trash GC on startup, purging expired items', () => {
    const a = createDoc(db, { name: 'a', folderId: null, contentText: 'x' })
    if (!isOk(a)) throw new Error('setup')
    deleteDoc(db, a.data.id)
    db.prepare(`UPDATE trash_items SET purge_after = ? WHERE item_id = ?`).run(Date.now() - 1000, a.data.id)

    const ipc = fakeIpc()
    bootstrap(ipc as never, db, {
      makeAskDeps: () => ({ embedQuery: async () => [], streamChat: async function* () {} })
    })

    const left = db.prepare(`SELECT COUNT(*) AS n FROM trash_items`).get() as { n: number }
    expect(left.n).toBe(0)
  })
})
