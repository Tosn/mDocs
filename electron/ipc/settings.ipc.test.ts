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

  it('saveModel upserts by provider+model (no duplicate rows, key updated)', async () => {
    await ipc.invoke(CHANNELS.settings.saveModel, {
      provider: 'openai',
      modelName: 'gpt-4o',
      apiKey: 'sk-first-000000'
    })
    const second = (await ipc.invoke(CHANNELS.settings.saveModel, {
      provider: 'openai',
      modelName: 'gpt-4o',
      apiKey: 'sk-second-111111'
    })) as { ok: true; data: { id: string } }
    const count = db
      .prepare(`SELECT COUNT(*) AS n FROM model_configs WHERE provider = ? AND model_name = ?`)
      .get('openai', 'gpt-4o') as { n: number }
    expect(count.n).toBe(1)
    // 同一行被复用，key 更新为新值的密文。
    const sel = (await ipc.invoke(CHANNELS.settings.selectModel, {
      provider: 'openai',
      modelName: 'gpt-4o'
    })) as { ok: true; data: { configId: string; maskedKey: string | null } }
    expect(sel.data.configId).toBe(second.data.id)
    expect(sel.data.maskedKey).toContain('...')
  })

  it('persists the registry baseUrl when saving a provider that needs one', async () => {
    const saved = (await ipc.invoke(CHANNELS.settings.saveModel, {
      provider: 'deepseek',
      modelName: 'deepseek-chat',
      apiKey: 'sk-deepseek-123456'
    })) as { ok: true; data: { baseUrl: string | null } }
    expect(saved.data.baseUrl).toBe('https://api.deepseek.com')
  })

  it('selectModel returns masked key for a configured model, null otherwise', async () => {
    const miss = (await ipc.invoke(CHANNELS.settings.selectModel, {
      provider: 'qwen',
      modelName: 'qwen-plus'
    })) as { ok: true; data: { configId: string | null; maskedKey: string | null; configured: boolean } }
    expect(miss.data.configId).toBeNull()
    expect(miss.data.maskedKey).toBeNull()
    expect(miss.data.configured).toBe(false)

    await ipc.invoke(CHANNELS.settings.saveModel, {
      provider: 'qwen',
      modelName: 'qwen-plus',
      apiKey: 'sk-qwen-7654321'
    })
    const hit = (await ipc.invoke(CHANNELS.settings.selectModel, {
      provider: 'qwen',
      modelName: 'qwen-plus'
    })) as { ok: true; data: { configId: string | null; maskedKey: string | null; configured: boolean } }
    expect(hit.data.configId).not.toBeNull()
    expect(hit.data.maskedKey).toContain('...')
    expect(hit.data.configured).toBe(true)
  })

  it('saving an embedding model sets the active embed config without stealing the active chat model', async () => {
    // 先配置对话模型 → 成为激活对话模型。
    const chat = (await ipc.invoke(CHANNELS.settings.saveModel, {
      provider: 'deepseek',
      modelName: 'deepseek-chat',
      apiKey: 'sk-chat-000000'
    })) as { ok: true; data: { id: string } }
    // 再配置嵌入模型（role: embedding）。
    const embed = (await ipc.invoke(CHANNELS.settings.saveModel, {
      provider: 'openai',
      modelName: 'text-embedding-3-small',
      apiKey: 'sk-embed-111111',
      role: 'embedding'
    })) as { ok: true; data: { id: string } }

    // 对话模型仍是 deepseek（嵌入未抢占 is_active）。
    const active = (await ipc.invoke(CHANNELS.settings.getActiveModel)) as {
      ok: boolean
      data: { id: string } | null
    }
    expect(active.data?.id).toBe(chat.data.id)

    // 激活的嵌入模型是 openai embedding。
    const activeEmbed = (await ipc.invoke(CHANNELS.settings.getActiveEmbedModel)) as {
      ok: boolean
      data: { id: string; modelName: string } | null
    }
    expect(activeEmbed.data?.id).toBe(embed.data.id)
    expect(activeEmbed.data?.modelName).toBe('text-embedding-3-small')
  })

  it('getActiveEmbedModel returns null when no embedding model is configured', async () => {
    const r = (await ipc.invoke(CHANNELS.settings.getActiveEmbedModel)) as {
      ok: boolean
      data: unknown | null
    }
    expect(r.ok).toBe(true)
    expect(r.data).toBeNull()
  })

  it('reindex rebuilds document indexes using the injected embed fn', async () => {
    const now = Date.now()
    db.prepare(
      `INSERT INTO documents (id, folder_id, name, type, file_path, source_url, content_text, content_hash, size, indexed_at, created_at, updated_at, deleted_at)
       VALUES ('d1', NULL, 'doc', 'md', '', NULL, 'some content to embed', 'h', 1, NULL, ?, ?, NULL)`
    ).run(now, now)
    const embed = async (texts: string[]) => texts.map(() => new Array(8).fill(0.1))
    registerSettingsIpc(ipc as never, db, { embed })

    const r = (await ipc.invoke(CHANNELS.settings.reindex)) as { ok: boolean; data?: { indexed: number } }
    expect(r.ok).toBe(true)
    expect(r.data?.indexed).toBe(1)
    const chunks = db.prepare(`SELECT COUNT(*) AS n FROM doc_chunks`).get() as { n: number }
    expect(chunks.n).toBeGreaterThan(0)
  })

  it('reindex without an embedding model returns an error', async () => {
    const r = (await ipc.invoke(CHANNELS.settings.reindex)) as { ok: boolean }
    expect(r.ok).toBe(false)
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
