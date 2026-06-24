import { describe, it, expect, beforeEach, vi } from 'vitest'
import { crawlApi } from './crawl.api'

const fns = {
  fromUrl: vi.fn(async () => ({ ok: true, data: {} })),
  fromUrlInteractive: vi.fn(async () => ({ ok: true, data: {} }))
}

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = { crawl: fns }
  Object.values(fns).forEach((f) => f.mockClear())
})

describe('crawlApi', () => {
  it('forwards normal crawl', async () => {
    await crawlApi.fromUrl({ url: 'https://a.com', folderId: null })
    expect(fns.fromUrl).toHaveBeenCalledWith({ url: 'https://a.com', folderId: null })
  })
  it('forwards interactive crawl', async () => {
    await crawlApi.fromUrlInteractive({ url: 'https://a.com', folderId: null })
    expect(fns.fromUrlInteractive).toHaveBeenCalledWith({ url: 'https://a.com', folderId: null })
  })
})
