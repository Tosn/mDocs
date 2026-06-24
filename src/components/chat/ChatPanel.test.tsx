import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ChatPanel } from './ChatPanel'

afterEach(cleanup)

describe('ChatPanel', () => {
  it('asks with the question and selected @scope', () => {
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
    fireEvent.click(screen.getByLabelText('Doc1'))
    fireEvent.change(screen.getByPlaceholderText(/提问/), { target: { value: 'hi' } })
    fireEvent.click(screen.getByText('发送'))
    expect(onAsk).toHaveBeenCalledWith('hi', { documentIds: ['d1'], folderIds: [] })
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
