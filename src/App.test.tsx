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
const docRename = vi.fn(async () => ({ ok: true, data: {} }))
const docDelete = vi.fn(async () => ({ ok: true, data: {} }))
const createDocMock = vi.fn(async () => ({ ok: true, data: mdDoc }))
const suggestName = vi.fn(async () => ({ ok: true, data: 'Doc (1)' }))

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
  docRename.mockClear()
  docDelete.mockClear()
  createDocMock.mockClear()
  createDocMock.mockImplementation(async () => ({ ok: true, data: mdDoc }))
  suggestName.mockClear()
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
      createDoc: createDocMock,
      suggestName,
      pickPaths: vi.fn(async () => ({ ok: true, data: ['/a/b.md'] })),
      upload,
      rename: docRename,
      delete: docDelete
    },
    settings: {
      listModels: vi.fn(async () => ({
        ok: true,
        data: [{ id: 'openai:gpt-4o', label: 'GPT-4o', provider: 'openai', modelName: 'gpt-4o', kind: 'chat' }]
      })),
      getActiveModel: vi.fn(async () => ({
        ok: true,
        data: {
          id: 'openai:gpt-4o',
          provider: 'openai',
          modelName: 'gpt-4o',
          baseUrl: null,
          keyRef: 'k',
          isActive: true,
          createdAt: 0
        }
      })),
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
    render(<App />)
    await waitFor(() => screen.getByText('新建文件夹'))
    fireEvent.click(screen.getByText('新建文件夹'))
    const dialog = await waitFor(() => screen.getByTestId('prompt-dialog'))
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'NewFolder' } })
    fireEvent.click(within(dialog).getByText('确定'))
    await waitFor(() => expect(folderCreate).toHaveBeenCalledWith({ name: 'NewFolder', parentId: null }))
  })

  it('returns to root via the 全部文档 entry', async () => {
    render(<App />)
    await waitFor(() => treeText('F'))
    fireEvent.click(treeText('F'))
    await waitFor(() => within(screen.getByTestId('pane-main')).getByText('note'))
    fireEvent.click(treeText('全部文档'))
    await waitFor(() =>
      expect(within(screen.getByTestId('pane-main')).queryByText('note')).toBeNull()
    )
    const calls = (window as unknown as { api: { document: { listByFolder: { mock: { calls: unknown[][] } } } } })
      .api.document.listByFolder.mock.calls
    expect(calls[calls.length - 1][0]).toBeNull()
  })

  it('renames a document from the list', async () => {
    render(<App />)
    await waitFor(() => treeText('F'))
    fireEvent.click(treeText('F'))
    await waitFor(() => within(screen.getByTestId('pane-main')).getByText('note'))
    fireEvent.click(screen.getByLabelText('重命名 note'))
    const dialog = await waitFor(() => screen.getByTestId('prompt-dialog'))
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'renamed' } })
    fireEvent.click(within(dialog).getByText('确定'))
    await waitFor(() => expect(docRename).toHaveBeenCalledWith('d1', 'renamed'))
  })

  it('deletes a document from the list after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)
    await waitFor(() => treeText('F'))
    fireEvent.click(treeText('F'))
    await waitFor(() => within(screen.getByTestId('pane-main')).getByText('note'))
    fireEvent.click(screen.getByLabelText('删除 note'))
    await waitFor(() => expect(docDelete).toHaveBeenCalledWith('d1'))
  })

  it('creates a doc under a suggested name when the name is a duplicate', async () => {
    createDocMock.mockResolvedValueOnce({ ok: false, error: { code: 'E_DUPLICATE', message: 'dup' } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)
    const main = screen.getByTestId('pane-main')
    await waitFor(() => within(main).getByText('新建'))
    fireEvent.click(within(main).getByText('新建'))
    const dialog = await waitFor(() => screen.getByTestId('prompt-dialog'))
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Doc' } })
    fireEvent.click(within(dialog).getByText('确定'))
    await waitFor(() => expect(suggestName).toHaveBeenCalledWith({ name: 'Doc', folderId: null }))
    await waitFor(() =>
      expect(createDocMock).toHaveBeenLastCalledWith({ name: 'Doc (1)', folderId: null, contentText: '' })
    )
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
    const chat = screen.getByTestId('pane-chat')
    fireEvent.change(within(chat).getByPlaceholderText(/提问/), { target: { value: '@no' } })
    await waitFor(() => expect(within(chat).getByLabelText('note')).toBeTruthy())
  })

  it('disables chat when no model is configured', async () => {
    ;(window as unknown as { api: { settings: { getActiveModel: unknown } } }).api.settings.getActiveModel = vi.fn(
      async () => ({ ok: true, data: null })
    )
    render(<App />)
    const chat = screen.getByTestId('pane-chat')
    await waitFor(() => expect(within(chat).getByText(/未配置 AI 模型/)).toBeTruthy())
    expect((within(chat).getByPlaceholderText(/配置/) as HTMLTextAreaElement).disabled).toBe(true)
  })
})
