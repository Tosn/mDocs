import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { App } from './App'

afterEach(cleanup)

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = {
    folder: { tree: vi.fn(async () => ({ ok: true, data: [] })) },
    document: { listByFolder: vi.fn(async () => ({ ok: true, data: [] })) },
    settings: {
      listModels: vi.fn(async () => ({ ok: true, data: [] })),
      getActiveModel: vi.fn(async () => ({ ok: true, data: null })),
      getPrivacyNotice: vi.fn(async () => ({ ok: true, data: { text: 'privacy' } }))
    },
    search: { keyword: vi.fn() },
    chat: {
      listSessions: vi.fn(async () => ({ ok: true, data: [] })),
      createSession: vi.fn(async () => ({ ok: true, data: { id: 's' } }))
    },
    on: vi.fn(() => () => {})
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
})
