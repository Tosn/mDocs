import { describe, it, expect, beforeEach } from 'vitest'
import { useChatStore } from './chat.store'

beforeEach(() => useChatStore.setState({ streaming: {}, sources: {}, error: null }))

describe('chat.store', () => {
  it('appendToken accumulates content per message', () => {
    useChatStore.getState().appendToken('m', 'He')
    useChatStore.getState().appendToken('m', 'llo')
    expect(useChatStore.getState().streaming['m']).toBe('Hello')
  })

  it('setSources stores sources for a message', () => {
    useChatStore.getState().setSources('m', [{ id: 's1' }] as never)
    expect(useChatStore.getState().sources['m'].length).toBe(1)
  })

  it('setError sets and clear resets', () => {
    useChatStore.getState().setError('boom')
    expect(useChatStore.getState().error).toBe('boom')
    useChatStore.getState().clear()
    expect(useChatStore.getState().error).toBeNull()
  })
})
