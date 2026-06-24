import { describe, it, expect, beforeEach, vi } from 'vitest'
import { searchApi } from './search.api'

const keyword = vi.fn(async () => ({ ok: true, data: [] }))

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = { search: { keyword } }
  keyword.mockClear()
})

describe('searchApi', () => {
  it('forwards keyword query', async () => {
    await searchApi.keyword({ query: 'hello' })
    expect(keyword).toHaveBeenCalledWith({ query: 'hello' })
  })
})
