import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ok, err } from '@shared/types'
import { AddWebDialog } from './AddWebDialog'

afterEach(cleanup)

describe('AddWebDialog', () => {
  it('static crawl via onCrawl', async () => {
    const onCrawl = vi.fn(async () => ok({ name: 'x' }))
    render(<AddWebDialog onCrawl={onCrawl} onInteractiveCrawl={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/链接/), { target: { value: 'https://a.com' } })
    fireEvent.click(screen.getByText('静态爬取'))
    await waitFor(() => expect(onCrawl).toHaveBeenCalledWith('https://a.com'))
  })

  it('dynamic crawl via onInteractiveCrawl', async () => {
    const onInteractiveCrawl = vi.fn(async () => ok({ name: 'x' }))
    render(<AddWebDialog onCrawl={vi.fn()} onInteractiveCrawl={onInteractiveCrawl} />)
    fireEvent.change(screen.getByPlaceholderText(/链接/), { target: { value: 'https://a.com' } })
    fireEvent.click(screen.getByText('动态爬取'))
    await waitFor(() => expect(onInteractiveCrawl).toHaveBeenCalledWith('https://a.com'))
  })

  it('cancel button calls onClose', () => {
    const onClose = vi.fn()
    render(<AddWebDialog onCrawl={vi.fn()} onInteractiveCrawl={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByText('取消'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows an error message when crawl fails', async () => {
    const onCrawl = vi.fn(async () => err('E_FETCH', '无法访问该链接'))
    render(<AddWebDialog onCrawl={onCrawl} onInteractiveCrawl={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/链接/), { target: { value: 'https://a.com' } })
    fireEvent.click(screen.getByText('静态爬取'))
    await waitFor(() => expect(screen.getByTestId('error').textContent).toContain('无法访问该链接'))
  })

  it('disables submit when url is empty', () => {
    render(<AddWebDialog onCrawl={vi.fn()} onInteractiveCrawl={vi.fn()} />)
    expect((screen.getByText('静态爬取') as HTMLButtonElement).disabled).toBe(true)
  })
})
