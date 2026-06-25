import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PromptDialog } from './PromptDialog'

afterEach(cleanup)

describe('PromptDialog', () => {
  it('prefills the input with defaultValue', () => {
    render(<PromptDialog title="新名称" defaultValue="root" onSubmit={vi.fn()} onCancel={vi.fn()} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('root')
  })

  it('submits the trimmed value on confirm', () => {
    const onSubmit = vi.fn()
    render(<PromptDialog title="新文件夹名称" onSubmit={onSubmit} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  NewFolder  ' } })
    fireEvent.click(screen.getByText('确定'))
    expect(onSubmit).toHaveBeenCalledWith('NewFolder')
  })

  it('does not submit when the value is empty', () => {
    const onSubmit = vi.fn()
    render(<PromptDialog title="新文件夹名称" onSubmit={onSubmit} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByText('确定'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits on Enter', () => {
    const onSubmit = vi.fn()
    render(<PromptDialog title="新名称" onSubmit={onSubmit} onCancel={vi.fn()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'x' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('x')
  })

  it('cancels on the cancel button', () => {
    const onCancel = vi.fn()
    render(<PromptDialog title="新名称" onSubmit={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('取消'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('cancels on Escape', () => {
    const onCancel = vi.fn()
    render(<PromptDialog title="新名称" onSubmit={vi.fn()} onCancel={onCancel} />)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })
})
