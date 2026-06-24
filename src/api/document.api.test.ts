import { describe, it, expect, beforeEach, vi } from 'vitest'
import { documentApi } from './document.api'

const fns = {
  listByFolder: vi.fn(async () => ({ ok: true, data: [] })),
  get: vi.fn(async () => ({ ok: true, data: {} })),
  getFileUrl: vi.fn(async () => ({ ok: true, data: 'file://x' })),
  pickPaths: vi.fn(async () => ({ ok: true, data: [] })),
  upload: vi.fn(async () => ({ ok: true, data: {} })),
  importFolder: vi.fn(async () => ({ ok: true, data: {} })),
  createDoc: vi.fn(async () => ({ ok: true, data: {} })),
  updateContent: vi.fn(async () => ({ ok: true, data: {} })),
  rename: vi.fn(async () => ({ ok: true, data: {} })),
  delete: vi.fn(async () => ({ ok: true }))
}

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = { document: fns }
  Object.values(fns).forEach((f) => f.mockClear())
})

describe('documentApi', () => {
  it('forwards createDoc', async () => {
    await documentApi.createDoc({ name: 'n', folderId: null, contentText: 'x' })
    expect(fns.createDoc).toHaveBeenCalledWith({ name: 'n', folderId: null, contentText: 'x' })
  })
  it('forwards updateContent args', async () => {
    await documentApi.updateContent('id1', 'new')
    expect(fns.updateContent).toHaveBeenCalledWith('id1', 'new')
  })
  it('forwards listByFolder', async () => {
    await documentApi.listByFolder(null)
    expect(fns.listByFolder).toHaveBeenCalledWith(null)
  })
  it('forwards pickPaths options', async () => {
    await documentApi.pickPaths({ directory: true })
    expect(fns.pickPaths).toHaveBeenCalledWith({ directory: true })
  })
})
