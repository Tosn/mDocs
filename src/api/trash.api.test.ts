import { describe, it, expect, beforeEach, vi } from 'vitest'
import { trashApi } from './trash.api'

const fns = {
  list: vi.fn(async () => ({ ok: true, data: [] })),
  restore: vi.fn(async () => ({ ok: true, data: { movedToRoot: false } })),
  purge: vi.fn(async () => ({ ok: true }))
}

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = { trash: fns }
  Object.values(fns).forEach((f) => f.mockClear())
})

describe('trashApi', () => {
  it('forwards list', async () => {
    await trashApi.list()
    expect(fns.list).toHaveBeenCalled()
  })
  it('forwards restore id', async () => {
    await trashApi.restore('t1')
    expect(fns.restore).toHaveBeenCalledWith('t1')
  })
  it('forwards purge id', async () => {
    await trashApi.purge('t2')
    expect(fns.purge).toHaveBeenCalledWith('t2')
  })
})
