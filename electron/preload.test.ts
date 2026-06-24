import { describe, it, expect, vi } from 'vitest'

const { contextBridge, ipcRenderer } = vi.hoisted(() => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: { invoke: vi.fn(async () => ({ ok: true })), on: vi.fn(), removeListener: vi.fn() }
}))
vi.mock('electron', () => ({ contextBridge, ipcRenderer }))

import { buildApi } from './preload'
import { CHANNELS, EVENTS } from '@shared/channels'

describe('preload', () => {
  it('exposes the api on contextBridge at module load', () => {
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('api', expect.anything())
  })

  it('buildApi exposes all 7 domains plus an on() subscriber', () => {
    const api = buildApi(vi.fn(), vi.fn())
    for (const d of ['folder', 'document', 'search', 'trash', 'crawl', 'chat', 'settings']) {
      expect((api as Record<string, unknown>)[d]).toBeDefined()
    }
    expect(typeof api.on).toBe('function')
  })

  it('domain methods invoke the matching channel', async () => {
    const invoke = vi.fn(async () => ({ ok: true }))
    const api = buildApi(invoke, vi.fn())
    await api.folder.create({ name: 'x', parentId: null })
    expect(invoke).toHaveBeenCalledWith(CHANNELS.folder.create, { name: 'x', parentId: null })
    await api.search.keyword({ query: 'q' })
    expect(invoke).toHaveBeenCalledWith(CHANNELS.search.keyword, { query: 'q' })
  })

  it('on() subscribes through the provided subscriber', () => {
    const on = vi.fn()
    const api = buildApi(vi.fn(), on)
    const cb = () => {}
    api.on(EVENTS.chatToken, cb)
    expect(on).toHaveBeenCalledWith(EVENTS.chatToken, cb)
  })
})
