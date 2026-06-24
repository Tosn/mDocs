import { describe, it, expect, beforeEach, vi } from 'vitest'
import { folderApi } from './folder.api'

const create = vi.fn(async () => ({ ok: true, data: {} }))
const list = vi.fn(async () => ({ ok: true, data: [] }))

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = {
    folder: { list, tree: vi.fn(), create, rename: vi.fn(), delete: vi.fn() }
  }
  create.mockClear()
  list.mockClear()
})

describe('folderApi', () => {
  it('forwards create to window.api.folder.create', async () => {
    await folderApi.create({ name: 'x', parentId: null })
    expect(create).toHaveBeenCalledWith({ name: 'x', parentId: null })
  })

  it('forwards list and returns the Result', async () => {
    const r = await folderApi.list(null)
    expect(list).toHaveBeenCalledWith(null)
    expect(r).toEqual({ ok: true, data: [] })
  })
})
