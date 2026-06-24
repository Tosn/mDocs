import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, within, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { App } from './App'
import { useEditorStore } from './stores/editor.store'
import { useChatStore } from './stores/chat.store'
import { useTreeStore } from './stores/tree.store'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const treeText = (t: string) => within(screen.getByTestId('pane-tree')).getByText(t)

let tokenCb: ((p: { messageId: string; delta: string }) => void) | null = null
let sourcesCb: ((p: { messageId: string; sources: unknown[] }) => void) | null = null
const updateContent = vi.fn(async () => ({ ok: true, data: {} }))
const upload = vi.fn(async () => ({ ok: true, data: { added: [], skipped: [] } }))
const saveModel = vi.fn(async () => ({ ok: true, data: {} }))
const folderCreate = vi.fn(async () => ({ ok: true, data: {} }))

const mdDoc = {
  id: 'd1',
  name: 'note',
  type: 'md',
  folderId: 'f',
  filePath: '',
  sourceUrl: null,
  contentText: 'hello body',
  contentHash: 'h',
  size: 1,
  indexedAt: null,
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null
}

beforeEach(() => {
  tokenCb = null
  sourcesCb = null
  updateContent.mockClear()
  upload.mockClear()
  saveModel.mockClear()
  folderCreate.mockClear()
  useEditorStore.setState({ docId: null, draft: '', dirty: false })
  useChatStore.setState({ streaming: {}, sources: {}, error: null })
  useTreeStore.setState({ expanded: {}, selectedId: null })
  ;(window as unknown as { api: unknown }).api = {
    folder: {
      tree: vi.fn(async () => ({ ok: true, data: [{ id: 'f', name: 'F', parentId: null, children: [] }] })),
      create: folderCreate,
      rename: vi.fn(async () => ({ ok: true, data: {} })),
      delete: vi.fn(async () => ({ ok: true }))
    },
    document: {
      listByFolder: vi.fn(async (fid: string | null) => ({
        ok: true,
        data: fid === 'f' ? [{ id: 'd1', name: 'note', type: 'md' }] : []
      })),
      get: vi.fn(async () => ({ ok: true, data: mdDoc })),
      getFileUrl: vi.fn(async () => ({ ok: true, data: 'file:///x.pdf' })),
      updateContent,
      createDoc: vi.fn(async () => ({ ok: true, data: mdDoc })),
      pickPaths: vi.fn(async () => ({ ok: true, data: ['/a/b.md'] })),
      upload
    },
    settings: {
      listModels: vi.fn(async () => ({
        ok: true,
        data: [{ id: 'openai:gpt-4o', label: 'GPT-4o', provider: 'openai', modelName: 'gpt-4o', kind: 'chat' }]
      })),
      getActiveModel: vi.fn(async () => ({ ok: true, data: null })),
      switchModel: vi.fn(async () => ({ ok: true, data: { needKey: true, maskedKey: null } })),
      saveModel,
      getPrivacyNotice: vi.fn(async () => ({ ok: true, data: { text: 'privacy' } }))
    },
    search: { keyword: vi.fn() },
    chat: {
      createSession: vi.fn(async () => ({ ok: true, data: { id: 's1' } })),
      ask: vi.fn(async () => {
        tokenCb?.({ messageId: 'm1', delta: 'Ans' })
        tokenCb?.({ messageId: 'm1', delta: 'wer' })
        sourcesCb?.({ messageId: 'm1', sources: [] })
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
  it('renders the three-pane layout', async () => {
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
    await waitFor(() => expect(screen.getByText(/离线|无网络/)).toBeTruthy())
  })

  it('asks a question and renders the streamed answer', async () => {
    render(<App />)
    await waitFor(() => screen.getByTestId('pane-chat'))
    fireEvent.change(screen.getByPlaceholderText(/提问/), { target: { value: 'q' } })
    fireEvent.click(screen.getByText('发送'))
    await waitFor(() => expect(screen.getByText('Answer')).toBeTruthy())
  })

  it('lists documents of a selected folder and previews one', async () => {
    render(<App />)
    await waitFor(() => treeText('F'))
    fireEvent.click(treeText('F'))
    await waitFor(() => within(screen.getByTestId('pane-main')).getByText('note'))
    fireEvent.click(within(screen.getByTestId('pane-main')).getByText('note'))
    await waitFor(() => expect(screen.getByText('hello body')).toBeTruthy())
  })

  it('edits a document and saves via updateContent', async () => {
    render(<App />)
    await waitFor(() => treeText('F'))
    fireEvent.click(treeText('F'))
    await waitFor(() => within(screen.getByTestId('pane-main')).getByText('note'))
    fireEvent.click(within(screen.getByTestId('pane-main')).getByText('note'))
    await waitFor(() => screen.getByText('编辑'))
    fireEvent.click(screen.getByText('编辑'))
    const box = within(screen.getByTestId('pane-main')).getByRole('textbox') as HTMLTextAreaElement
    expect(box.value).toBe('hello body')
    fireEvent.change(box, { target: { value: 'new content' } })
    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => expect(updateContent).toHaveBeenCalledWith('d1', 'new content'))
  })

  it('creates a folder via the toolbar', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('NewFolder')
    render(<App />)
    await waitFor(() => screen.getByText('新建文件夹'))
    fireEvent.click(screen.getByText('新建文件夹'))
    await waitFor(() => expect(folderCreate).toHaveBeenCalledWith({ name: 'NewFolder', parentId: null }))
  })

  it('uploads picked files', async () => {
    render(<App />)
    await waitFor(() => screen.getByText('上传'))
    fireEvent.click(screen.getByText('上传'))
    await waitFor(() => expect(upload).toHaveBeenCalledWith({ paths: ['/a/b.md'], folderId: null }))
  })

  it('saves an API key for a selected model in settings', async () => {
    render(<App />)
    await waitFor(() => screen.getByText('设置'))
    fireEvent.click(screen.getByText('设置'))
    const panel = screen.getByTestId('settings-panel')
    fireEvent.change(within(panel).getByRole('combobox'), { target: { value: 'openai:gpt-4o' } })
    fireEvent.change(within(panel).getByPlaceholderText(/API Key/), { target: { value: 'k' } })
    fireEvent.click(within(panel).getByText('保存'))
    await waitFor(() =>
      expect(saveModel).toHaveBeenCalledWith({ provider: 'openai', modelName: 'gpt-4o', apiKey: 'k' })
    )
  })

  it('offers the opened folder documents as @scope options', async () => {
    render(<App />)
    await waitFor(() => treeText('F'))
    fireEvent.click(treeText('F'))
    await waitFor(() => within(screen.getByTestId('pane-main')).getByText('note'))
    expect(within(screen.getByTestId('pane-chat')).getByLabelText('note')).toBeTruthy()
  })
})
