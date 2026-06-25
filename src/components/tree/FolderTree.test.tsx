import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { FolderTree } from './FolderTree'

afterEach(cleanup)

const nodes = [
  { id: 'r', name: 'root', parentId: null, children: [{ id: 'c', name: 'child', parentId: 'r', children: [] }] }
]

describe('FolderTree', () => {
  it('renders nested nodes when expanded', () => {
    render(<FolderTree nodes={nodes} expanded={{ r: true }} onToggle={vi.fn()} onSelect={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('root')).toBeTruthy()
    expect(screen.getByText('child')).toBeTruthy()
  })

  it('hides children when collapsed', () => {
    render(<FolderTree nodes={nodes} expanded={{}} onToggle={vi.fn()} onSelect={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.queryByText('child')).toBeNull()
  })

  it('clicking a node selects it', () => {
    const onSelect = vi.fn()
    render(<FolderTree nodes={nodes} expanded={{}} onToggle={vi.fn()} onSelect={onSelect} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByText('root'))
    expect(onSelect).toHaveBeenCalledWith('r')
  })

  it('delete asks for confirmation before deleting', () => {
    const onDelete = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<FolderTree nodes={nodes} expanded={{}} onToggle={vi.fn()} onSelect={vi.fn()} onDelete={onDelete} />)
    fireEvent.click(screen.getByLabelText('删除 root'))
    expect(window.confirm).toHaveBeenCalled()
    expect(onDelete).toHaveBeenCalledWith('r')
  })

  it('rename requests onRename with the current name', () => {
    const onRename = vi.fn()
    render(
      <FolderTree
        nodes={nodes}
        expanded={{}}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onRename={onRename}
      />
    )
    fireEvent.click(screen.getByLabelText('重命名 root'))
    expect(onRename).toHaveBeenCalledWith('r', 'root')
  })

  it('marks the selected node active', () => {
    const { container } = render(
      <FolderTree nodes={nodes} expanded={{}} onToggle={vi.fn()} onSelect={vi.fn()} onDelete={vi.fn()} selectedId="r" />
    )
    const row = container.querySelector('.tree-row.active')
    expect(row).toBeTruthy()
    expect(within(row as HTMLElement).getByText('root')).toBeTruthy()
  })

  it('cancelling confirmation keeps the folder', () => {
    const onDelete = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<FolderTree nodes={nodes} expanded={{}} onToggle={vi.fn()} onSelect={vi.fn()} onDelete={onDelete} />)
    fireEvent.click(screen.getByLabelText('删除 root'))
    expect(onDelete).not.toHaveBeenCalled()
  })
})
