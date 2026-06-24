import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'

const { safeStorage } = vi.hoisted(() => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from('enc:' + s, 'utf-8')),
    decryptString: vi.fn((b: Buffer) => b.toString('utf-8').replace(/^enc:/, ''))
  }
}))
vi.mock('electron', () => ({ safeStorage }))

import { openDb } from '../db/index'
import { CHANNELS } from '@shared/channels'
import { registerSettingsIpc } from './settings.ipc'
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
  registerSettingsIpc(ipc as never, db)
})
afterEach(() => db.close())

describe('settings.ipc', () => {
  it('registers all settings channels', () => {
    for (const c of Object.values(CHANNELS.settings)) expect(ipc.has(c)).toBe(true)
  })

  it('lists available models', async () => {
    const r = (await ipc.invoke(CHANNELS.settings.listModels)) as { ok: boolean; data: unknown[] }
    expect(r.ok).toBe(true)
    expect(r.data.length).toBeGreaterThan(0)
  })

  it('saves a model + key, then getActiveModel returns it', async () => {
    const saved = (await ipc.invoke(CHANNELS.settings.saveModel, {
      provider: 'openai',
      modelName: 'gpt-4o',
      apiKey: 'sk-secret-123456'
    })) as { ok: true; data: { id: string } }
    expect(saved.ok).toBe(true)

    const active = (await ipc.invoke(CHANNELS.settings.getActiveModel)) as {
      ok: boolean
      data: { id: string } | null
    }
    expect(active.ok).toBe(true)
    expect(active.data?.id).toBe(saved.data.id)
  })

  it('switchModel reports a masked key when one exists', async () => {
    const saved = (await ipc.invoke(CHANNELS.settings.saveModel, {
      provider: 'openai',
      modelName: 'gpt-4o',
      apiKey: 'sk-abcdefgh1234'
    })) as { ok: true; data: { id: string } }
    const r = (await ipc.invoke(CHANNELS.settings.switchModel, saved.data.id)) as {
      ok: boolean
      data: { needKey: boolean; maskedKey?: string | null }
    }
    expect(r.ok).toBe(true)
    expect(r.data.needKey).toBe(false)
    expect(r.data.maskedKey).toContain('...')
  })

  it('returns a privacy notice', async () => {
    const r = (await ipc.invoke(CHANNELS.settings.getPrivacyNotice)) as {
      ok: boolean
      data: { text: string }
    }
    expect(isOk(r as never)).toBe(true)
    expect(r.data.text.length).toBeGreaterThan(0)
  })
})
