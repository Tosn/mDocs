import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DocEditor } from './DocEditor'

afterEach(cleanup)

describe('DocEditor', () => {
  it('editable: typing calls onChange and save calls onSave', () => {
    const onChange = vi.fn()
    const onSave = vi.fn()
    render(<DocEditor value="hi" dirty={false} editable onChange={onChange} onSave={onSave} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } })
    expect(onChange).toHaveBeenCalledWith('hello')
    fireEvent.click(screen.getByText('保存'))
    expect(onSave).toHaveBeenCalled()
  })

  it('shows an unsaved indicator when dirty', () => {
    render(<DocEditor value="x" dirty editable onChange={vi.fn()} onSave={vi.fn()} />)
    expect(screen.getByText(/未保存/)).toBeTruthy()
  })

  it('non-editable (pdf) shows a limit notice and no textbox', () => {
    render(<DocEditor value="" dirty={false} editable={false} onChange={vi.fn()} onSave={vi.fn()} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText(/不支持编辑/)).toBeTruthy()
  })
})
