import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { FileTree, type FileNode } from './FileTree'

afterEach(cleanup)

const nodes: FileNode[] = [
  {
    kind: 'folder',
    folderId: null,
    name: '默认',
    isDefault: true,
    docCount: 1,
    children: [{ kind: 'doc', id: 'r1', name: 'rootdoc.md', docType: 'md' }]
  },
  {
    kind: 'folder',
    folderId: 'f1',
    name: 'Work',
    isDefault: false,
    docCount: 1,
    children: [{ kind: 'doc', id: 'd1', name: 'task.md', docType: 'md' }]
  }
]

function renderTree(overrides = {}) {
  const props = {
    nodes,
    expanded: { __default__: true, f1: true } as Record<string, boolean>,
    onToggle: vi.fn(),
    selectedFolderId: null as string | null,
    openDocId: null as string | null,
    onSelectFolder: vi.fn(),
    onOpenDoc: vi.fn(),
    onRenameFolder: vi.fn(),
    onRenameDoc: vi.fn(),
    onMoveDoc: vi.fn(),
    onContextMenu: vi.fn(),
    onBackgroundContextMenu: vi.fn(),
    ...overrides
  }
  render(<FileTree {...props} />)
  return props
}

const rowOf = (text: string) => screen.getByText(text).closest('.tree-row') as HTMLElement

describe('FileTree', () => {
  it('renders folders and nested documents (with extensions + typed icon)', () => {
    renderTree()
    expect(screen.getByText('默认')).toBeTruthy()
    expect(screen.getByText('Work')).toBeTruthy()
    expect(screen.getByText('task.md')).toBeTruthy()
    const icon = rowOf('task.md').querySelector('.tree-icon.doc') as HTMLElement
    expect(icon.getAttribute('data-type')).toBe('md')
  })

  it('clicking a document opens it; clicking a folder toggles+selects', () => {
    const p = renderTree()
    fireEvent.click(screen.getByText('task.md'))
    expect(p.onOpenDoc).toHaveBeenCalledWith('d1')
    fireEvent.click(screen.getByText('Work'))
    expect(p.onToggle).toHaveBeenCalledWith('f1')
    expect(p.onSelectFolder).toHaveBeenCalledWith('f1')
  })

  it('Enter on a selected document row starts inline rename', () => {
    const p = renderTree()
    fireEvent.keyDown(rowOf('task.md'), { key: 'Enter' })
    const input = screen.getByDisplayValue('task.md')
    fireEvent.change(input, { target: { value: 'renamed.md' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(p.onRenameDoc).toHaveBeenCalledWith('d1', 'renamed.md')
  })

  it('the default node cannot be renamed via Enter', () => {
    renderTree()
    fireEvent.keyDown(rowOf('默认'), { key: 'Enter' })
    expect(screen.queryByDisplayValue('默认')).toBeNull()
  })

  it('right-click opens a context menu for the node', () => {
    const p = renderTree()
    fireEvent.contextMenu(rowOf('task.md'))
    expect(p.onContextMenu).toHaveBeenCalled()
  })

  it('right-click on the blank tree area opens the create menu', () => {
    const p = renderTree()
    const ul = screen.getByText('默认').closest('.file-tree') as HTMLElement
    fireEvent.contextMenu(ul)
    expect(p.onBackgroundContextMenu).toHaveBeenCalled()
  })

  it('dropping a dragged doc onto a folder moves it', () => {
    const p = renderTree()
    fireEvent.dragOver(rowOf('Work'))
    fireEvent.drop(rowOf('Work'), { dataTransfer: { getData: () => 'doc-x' } })
    expect(p.onMoveDoc).toHaveBeenCalledWith('doc-x', 'f1')
  })
})
