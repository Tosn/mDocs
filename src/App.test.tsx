import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { App } from './App'

afterEach(cleanup)

let tokenCb: ((p: { messageId: string; delta: string }) => void) | null = null
let sourcesCb: ((p: { messageId: string; sources: unknown[] }) => void) | null = null

beforeEach(() => {
  tokenCb = null
  sourcesCb = null
  ;(window as unknown as { api: unknown }).api = {
    folder: { tree: vi.fn(async () => ({ ok: true, data: [] })), delete: vi.fn() },
    document: { listByFolder: vi.fn(async () => ({ ok: true, data: [] })) },
    settings: {
      listModels: vi.fn(async () => ({ ok: true, data: [] })),
      getActiveModel: vi.fn(async () => ({ ok: true, data: null })),
      getPrivacyNotice: vi.fn(async () => ({ ok: true, data: { text: 'privacy' } }))
    },
    search: { keyword: vi.fn() },
    chat: {
      listSessions: vi.fn(async () => ({ ok: true, data: [] })),
      createSession: vi.fn(async () => ({ ok: true, data: { id: 's1' } })),
      getMessages: vi.fn(async () => ({ ok: true, data: [] })),
      ask: vi.fn(async () => {
        tokenCb?.({ messageId: 'm1', delta: 'Ans' })
        tokenCb?.({ messageId: 'm1', delta: 'wer' })
        sourcesCb?.({
          messageId: 'm1',
          sources: [{ id: 's', messageId: 'm1', documentId: 'd', chunkId: 'c', snippet: 'snip', score: 1 }]
        })
        return { ok: true, data: { messageId: 'm1' } }
      })
    },
    on: (event: string, cb: (p: never) => void) => {
      if (event === 'chat:token') tokenCb = cb as never
      if (event === 'chat:sources') sourcesCb = cb as never
      return () => {}
    }
  }
})

describe('App', () => {
  it('renders the three-pane layout (tree / main / chat)', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('pane-tree')).toBeTruthy()
      expect(screen.getByTestId('pane-main')).toBeTruthy()
      expect(screen.getByTestId('pane-chat')).toBeTruthy()
    })
  })

  it('shows an offline banner when navigator is offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<App />)
    await waitFor(() => expect(screen.getByText(/离线|当前不可用|无网络/)).toBeTruthy())
  })

  it('asks a question and renders the streamed answer', async () => {
    render(<App />)
    await waitFor(() => screen.getByTestId('pane-chat'))
    fireEvent.change(screen.getByPlaceholderText(/提问/), { target: { value: 'q' } })
    fireEvent.click(screen.getByText('发送'))
    await waitFor(() => expect(screen.getByText('Answer')).toBeTruthy())
  })
})
