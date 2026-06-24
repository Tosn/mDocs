import { describe, it, expect } from 'vitest'
import { chatStream, embed, type StreamFn, type EmbedApiFn } from './provider'
import { isOk } from '@shared/types'

describe('llm provider', () => {
  it('chatStream relays token deltas from the transport', async () => {
    const fake: StreamFn = async function* () {
      yield 'Hello'
      yield ' world'
    }
    const out: string[] = []
    for await (const t of chatStream({ model: 'm', apiKey: 'k', messages: [] }, fake)) out.push(t)
    expect(out.join('')).toBe('Hello world')
  })

  it('chatStream propagates transport errors', async () => {
    const fake: StreamFn = async function* () {
      throw new Error('boom')
    }
    await expect(
      (async () => {
        for await (const _ of chatStream({ model: 'm', apiKey: 'k', messages: [] }, fake)) {
          void _
        }
      })()
    ).rejects.toThrow('boom')
  })

  it('embed returns vectors from the transport', async () => {
    const fake: EmbedApiFn = async () => [[1, 2, 3]]
    const r = await embed({ model: 'm', apiKey: 'k', texts: ['a'] }, fake)
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data).toEqual([[1, 2, 3]])
  })

  it('embed surfaces transport errors as Result', async () => {
    const r = await embed({ model: 'm', apiKey: 'k', texts: ['a'] }, async () => {
      throw new Error('x')
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('E_EMBED')
  })
})
