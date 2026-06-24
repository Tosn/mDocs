import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ok, err } from '@shared/types'
import { AddWebDialog } from './AddWebDialog'

afterEach(cleanup)

describe('AddWebDialog', () => {
  it('crawls a normal url via onCrawl', async () => {
    const onCrawl = vi.fn(async () => ok({ name: 'x' }))
    render(<AddWebDialog onCrawl={onCrawl} onInteractiveCrawl={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/链接/), { target: { value: 'https://a.com' } })
    fireEvent.click(screen.getByText('添加'))
    await waitFor(() => expect(onCrawl).toHaveBeenCalledWith('https://a.com'))
  })

  it('uses interactive crawl for login-required pages', async () => {
    const onInteractiveCrawl = vi.fn(async () => ok({ name: 'x' }))
    render(<AddWebDialog onCrawl={vi.fn()} onInteractiveCrawl={onInteractiveCrawl} />)
    fireEvent.change(screen.getByPlaceholderText(/链接/), { target: { value: 'https://a.com' } })
    fireEvent.click(screen.getByText(/需要登录/))
    await waitFor(() => expect(onInteractiveCrawl).toHaveBeenCalledWith('https://a.com'))
  })

  it('shows an error message when crawl fails', async () => {
    const onCrawl = vi.fn(async () => err('E_FETCH', '无法访问该链接'))
    render(<AddWebDialog onCrawl={onCrawl} onInteractiveCrawl={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/链接/), { target: { value: 'https://a.com' } })
    fireEvent.click(screen.getByText('添加'))
    await waitFor(() => expect(screen.getByTestId('error').textContent).toContain('无法访问该链接'))
  })

  it('disables submit when url is empty', () => {
    render(<AddWebDialog onCrawl={vi.fn()} onInteractiveCrawl={vi.fn()} />)
    expect((screen.getByText('添加') as HTMLButtonElement).disabled).toBe(true)
  })
})
