import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TrashPanel } from './TrashPanel'

afterEach(cleanup)

const items = [
  { id: 't1', itemType: 'document' as const, name: 'note.md', deletedAt: 0, purgeAfter: Date.now() + 7 * 86400000 },
  { id: 't2', itemType: 'folder' as const, name: 'docs', deletedAt: 0, purgeAfter: Date.now() + 7 * 86400000 }
]

function renderPanel(overrides = {}) {
  const props = {
    items,
    onRestore: vi.fn(),
    onPurge: vi.fn(),
    onRestoreMany: vi.fn(),
    onPurgeMany: vi.fn(),
    ...overrides
  }
  render(<TrashPanel {...props} />)
  return props
}

describe('TrashPanel', () => {
  it('shows an empty state when there is nothing', () => {
    renderPanel({ items: [] })
    expect(screen.getByText(/回收站为空/)).toBeTruthy()
  })

  it('lists items and triggers single restore / purge', () => {
    const props = renderPanel()
    expect(screen.getByText('note.md')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('恢复 note.md'))
    expect(props.onRestore).toHaveBeenCalledWith('t1')
    fireEvent.click(screen.getByLabelText('彻底删除 note.md'))
    expect(props.onPurge).toHaveBeenCalledWith('t1')
  })

  it('batch-restores selected items', () => {
    const props = renderPanel()
    fireEvent.click(screen.getByLabelText('选择 note.md'))
    fireEvent.click(screen.getByLabelText('选择 docs'))
    fireEvent.click(screen.getByText('批量恢复'))
    expect(props.onRestoreMany).toHaveBeenCalledWith(['t1', 't2'])
  })

  it('select-all then batch-purges', () => {
    const props = renderPanel()
    fireEvent.click(screen.getByLabelText('全选'))
    fireEvent.click(screen.getByText('批量彻底删除'))
    expect(props.onPurgeMany).toHaveBeenCalledWith(['t1', 't2'])
  })
})
