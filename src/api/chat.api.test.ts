import { describe, it, expect, beforeEach, vi } from 'vitest'
import { chatApi } from './chat.api'

const fns = {
  listSessions: vi.fn(async () => ({ ok: true, data: [] })),
  createSession: vi.fn(async () => ({ ok: true, data: {} })),
  getMessages: vi.fn(async () => ({ ok: true, data: [] })),
  ask: vi.fn(async () => ({ ok: true, data: { messageId: 'm1' } }))
}
const on = vi.fn(() => () => {})

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = { chat: fns, on }
  Object.values(fns).forEach((f) => f.mockClear())
  on.mockClear()
})

describe('chatApi', () => {
  it('forwards ask with scope', async () => {
    await chatApi.ask({ sessionId: 's', question: 'q', scope: { documentIds: ['d1'] } })
    expect(fns.ask).toHaveBeenCalledWith({
      sessionId: 's',
      question: 'q',
      scope: { documentIds: ['d1'] }
    })
  })
  it('subscribes to streaming events via on()', () => {
    const cb = vi.fn()
    chatApi.onToken(cb)
    expect(on).toHaveBeenCalledWith('chat:token', cb)
  })
})
