import { describe, it, expect } from 'vitest'
import { buildMessages } from './prompt'

describe('buildMessages', () => {
  it('system prompt carries no-fabrication + source-citation constraints', () => {
    const m = buildMessages({ question: 'q', chunks: [{ documentId: 'd', chunkId: 'c', text: 'fact' }] })
    const sys = m.find((x) => x.role === 'system')!.content
    expect(sys).toMatch(/未找到|未在文档/)
    expect(sys).toMatch(/来源/)
  })

  it('user message embeds the chunks and the question', () => {
    const m = buildMessages({
      question: 'what is it?',
      chunks: [{ documentId: 'd', chunkId: 'c', text: 'the important fact' }]
    })
    const user = m.find((x) => x.role === 'user')!.content
    expect(user).toContain('the important fact')
    expect(user).toContain('what is it?')
  })

  it('handles empty context by still including the question', () => {
    const m = buildMessages({ question: 'lonely question', chunks: [] })
    const user = m.find((x) => x.role === 'user')!.content
    expect(user).toContain('lonely question')
  })

  it('numbers sources so the model can cite them', () => {
    const m = buildMessages({
      question: 'q',
      chunks: [
        { documentId: 'd1', chunkId: 'c1', text: 'first' },
        { documentId: 'd2', chunkId: 'c2', text: 'second' }
      ]
    })
    const user = m.find((x) => x.role === 'user')!.content
    expect(user).toContain('first')
    expect(user).toContain('second')
    expect(user).toMatch(/1/)
    expect(user).toMatch(/2/)
  })
})
