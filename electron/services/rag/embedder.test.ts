import { describe, it, expect } from 'vitest'
import { embedTexts, type EmbedFn } from './embedder'
import { isOk } from '@shared/types'

describe('embedTexts', () => {
  it('batches inputs and concatenates vectors in order', async () => {
    const calls: number[] = []
    const embed: EmbedFn = async (texts) => {
      calls.push(texts.length)
      return texts.map((_, i) => [calls.length, i])
    }
    const r = await embedTexts(['a', 'b', 'c'], embed, { batchSize: 2 })
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data.length).toBe(3)
    expect(calls).toEqual([2, 1])
  })

  it('returns empty for empty input without calling the api', async () => {
    let called = false
    const embed: EmbedFn = async () => {
      called = true
      return []
    }
    const r = await embedTexts([], embed)
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data).toEqual([])
    expect(called).toBe(false)
  })

  it('returns an error when the embedding api fails', async () => {
    const embed: EmbedFn = async () => {
      throw new Error('boom')
    }
    const r = await embedTexts(['x'], embed)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('E_EMBED')
  })
})
