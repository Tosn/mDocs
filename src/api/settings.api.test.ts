import { describe, it, expect, beforeEach, vi } from 'vitest'
import { settingsApi } from './settings.api'

const fns = {
  listModels: vi.fn(async () => ({ ok: true, data: [] })),
  getActiveModel: vi.fn(async () => ({ ok: true, data: null })),
  switchModel: vi.fn(async () => ({ ok: true, data: { needKey: false } })),
  saveModel: vi.fn(async () => ({ ok: true, data: {} })),
  testModel: vi.fn(async () => ({ ok: true, data: { ok: true } })),
  getPrivacyNotice: vi.fn(async () => ({ ok: true, data: { text: 'x' } }))
}

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = { settings: fns }
  Object.values(fns).forEach((f) => f.mockClear())
})

describe('settingsApi', () => {
  it('forwards saveModel', async () => {
    await settingsApi.saveModel({ provider: 'openai', modelName: 'gpt-4o', apiKey: 'k' })
    expect(fns.saveModel).toHaveBeenCalledWith({ provider: 'openai', modelName: 'gpt-4o', apiKey: 'k' })
  })
  it('forwards switchModel id', async () => {
    await settingsApi.switchModel('m1')
    expect(fns.switchModel).toHaveBeenCalledWith('m1')
  })
  it('forwards listModels', async () => {
    await settingsApi.listModels()
    expect(fns.listModels).toHaveBeenCalled()
  })
})
