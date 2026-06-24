import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { SearchPanel } from './SearchPanel'

afterEach(cleanup)

describe('SearchPanel', () => {
  it('shows results after searching', async () => {
    const onSearch = vi.fn(async () => [{ documentId: 'd', name: 'doc', snippet: 'a hit', charStart: 0 }])
    render(<SearchPanel onSearch={onSearch} onOpenHit={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: 'q' } })
    fireEvent.click(screen.getByText('搜索'))
    await waitFor(() => expect(screen.getByText('doc')).toBeTruthy())
  })

  it('shows an empty state when nothing matches', async () => {
    const onSearch = vi.fn(async () => [])
    render(<SearchPanel onSearch={onSearch} onOpenHit={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: 'zzz' } })
    fireEvent.click(screen.getByText('搜索'))
    await waitFor(() => expect(screen.getByText(/未找到相关结果/)).toBeTruthy())
  })

  it('clicking a result opens it', async () => {
    const onOpenHit = vi.fn()
    const onSearch = vi.fn(async () => [{ documentId: 'd', name: 'doc', snippet: 'a hit', charStart: 5 }])
    render(<SearchPanel onSearch={onSearch} onOpenHit={onOpenHit} />)
    fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: 'q' } })
    fireEvent.click(screen.getByText('搜索'))
    await waitFor(() => screen.getByText('doc'))
    fireEvent.click(screen.getByText('doc'))
    expect(onOpenHit).toHaveBeenCalledWith({ documentId: 'd', name: 'doc', snippet: 'a hit', charStart: 5 })
  })
})
