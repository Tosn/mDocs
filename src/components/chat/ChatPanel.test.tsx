import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ChatPanel } from './ChatPanel'

afterEach(cleanup)

describe('ChatPanel', () => {
  it('asks with the question and @scope picked from the mention popup', () => {
    const onAsk = vi.fn()
    render(
      <ChatPanel
        messages={[]}
        sources={{}}
        scopeOptions={[{ id: 'd1', name: 'Doc1', kind: 'document' }]}
        onAsk={onAsk}
        onOpenSource={vi.fn()}
      />
    )
    const ta = screen.getByPlaceholderText(/提问/)
    fireEvent.change(ta, { target: { value: '@Doc' } })
    fireEvent.click(screen.getByLabelText('Doc1'))
    fireEvent.change(ta, { target: { value: 'hi' } })
    fireEvent.click(screen.getByText('发送'))
    expect(onAsk).toHaveBeenCalledWith('hi', { documentIds: ['d1'], folderIds: [] })
  })

  it('removes a picked scope via its chip', () => {
    const onAsk = vi.fn()
    render(
      <ChatPanel
        messages={[]}
        sources={{}}
        scopeOptions={[{ id: 'd1', name: 'Doc1', kind: 'document' }]}
        onAsk={onAsk}
        onOpenSource={vi.fn()}
      />
    )
    const ta = screen.getByPlaceholderText(/提问/)
    fireEvent.change(ta, { target: { value: '@Doc' } })
    fireEvent.click(screen.getByLabelText('Doc1'))
    fireEvent.click(screen.getByLabelText('移除 Doc1'))
    fireEvent.change(ta, { target: { value: 'hi' } })
    fireEvent.click(screen.getByText('发送'))
    expect(onAsk).toHaveBeenCalledWith('hi', { documentIds: [], folderIds: [] })
  })

  it('sends on Enter but not on Shift+Enter', () => {
    const onAsk = vi.fn()
    render(<ChatPanel messages={[]} sources={{}} scopeOptions={[]} onAsk={onAsk} onOpenSource={vi.fn()} />)
    const ta = screen.getByPlaceholderText(/提问/)
    fireEvent.change(ta, { target: { value: 'hi' } })
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true })
    expect(onAsk).not.toHaveBeenCalled()
    fireEvent.keyDown(ta, { key: 'Enter' })
    expect(onAsk).toHaveBeenCalledWith('hi', { documentIds: [], folderIds: [] })
  })

  it('disables the composer and shows a notice when the model is not ready', () => {
    render(
      <ChatPanel
        messages={[]}
        sources={{}}
        scopeOptions={[]}
        onAsk={vi.fn()}
        onOpenSource={vi.fn()}
        modelReady={false}
      />
    )
    expect(screen.getByText(/没有可用模型/)).toBeTruthy()
    expect((screen.getByPlaceholderText(/配置/) as HTMLTextAreaElement).disabled).toBe(true)
    expect((screen.getByText('发送') as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows a thinking bubble while awaiting the answer', () => {
    const { rerender } = render(
      <ChatPanel
        messages={[{ id: 'u1', role: 'user', content: '关于 claude skill' }]}
        sources={{}}
        scopeOptions={[]}
        onAsk={vi.fn()}
        onOpenSource={vi.fn()}
        modelReady
        thinking
      />
    )
    expect(screen.getByTestId('thinking')).toBeTruthy()
    expect(screen.getByText('思考中')).toBeTruthy()

    // 首个 token 到达（出现助手气泡）后，思考态消失。
    rerender(
      <ChatPanel
        messages={[
          { id: 'u1', role: 'user', content: '关于 claude skill' },
          { id: 'a1', role: 'assistant', content: '使用指南' }
        ]}
        sources={{}}
        scopeOptions={[]}
        onAsk={vi.fn()}
        onOpenSource={vi.fn()}
        modelReady
        thinking
      />
    )
    expect(screen.queryByTestId('thinking')).toBeNull()
  })

  it('shows the current model above the composer when ready', () => {
    render(
      <ChatPanel
        messages={[]}
        sources={{}}
        scopeOptions={[]}
        onAsk={vi.fn()}
        onOpenSource={vi.fn()}
        modelReady
        modelLabel="OpenAI GPT-4o"
      />
    )
    expect(screen.getByText(/当前模型：OpenAI GPT-4o/)).toBeTruthy()
  })

  it('renders messages and clickable sources', () => {
    const onOpenSource = vi.fn()
    render(
      <ChatPanel
        messages={[{ id: 'm', role: 'assistant', content: 'the answer' }]}
        sources={{ m: [{ id: 's', messageId: 'm', documentId: 'd', chunkId: 'c', snippet: 'snip', score: 1 }] }}
        scopeOptions={[]}
        onAsk={vi.fn()}
        onOpenSource={onOpenSource}
      />
    )
    expect(screen.getByText('the answer')).toBeTruthy()
    fireEvent.click(screen.getByText(/snip/))
    expect(onOpenSource).toHaveBeenCalledWith('d')
  })

  it('shows an error banner', () => {
    render(<ChatPanel messages={[]} sources={{}} scopeOptions={[]} onAsk={vi.fn()} onOpenSource={vi.fn()} error="boom" />)
    expect(screen.getByText('boom')).toBeTruthy()
  })
})
