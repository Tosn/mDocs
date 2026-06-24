import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { openDb } from '../db/index'
import { CHANNELS } from '@shared/channels'
import { registerCrawlIpc } from './crawl.ipc'

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
afterEach(() => {
  db.close()
  vi.restoreAllMocks()
})

describe('crawl.ipc', () => {
  beforeEach(() => {
    db = openDb(':memory:')
    ipc = fakeIpc()
  })

  it('registers fromUrl and fromUrlInteractive channels', () => {
    registerCrawlIpc(ipc as never, db, {})
    expect(ipc.has(CHANNELS.crawl.fromUrl)).toBe(true)
    expect(ipc.has(CHANNELS.crawl.fromUrlInteractive)).toBe(true)
  })

  it('fromUrl handler passes through service errors (invalid url)', async () => {
    registerCrawlIpc(ipc as never, db, {})
    const r = (await ipc.invoke(CHANNELS.crawl.fromUrl, { url: 'not a url', folderId: null })) as {
      ok: boolean
      error?: { code: string }
    }
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('E_INVALID_URL')
  })

  it('interactive handler uses injected capturePage', async () => {
    const html = `<html><head><title>T</title></head><body><article><p>${'logged in content here. '.repeat(
      12
    )}</p></article></body></html>`
    registerCrawlIpc(ipc as never, db, {
      interactiveDeps: { capturePage: async (u) => ({ html, finalUrl: u }) }
    })
    const r = (await ipc.invoke(CHANNELS.crawl.fromUrlInteractive, {
      url: 'https://site.test/member',
      folderId: null
    })) as { ok: boolean; data?: { type: string } }
    expect(r.ok).toBe(true)
    expect(r.data?.type).toBe('web')
  })
})
