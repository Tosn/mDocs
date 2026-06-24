import { useState } from 'react'
import type { MessageSource } from '@shared/types'

interface ScopeOption {
  id: string
  name: string
  kind: 'document' | 'folder'
}

interface ChatMessageView {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface ChatPanelProps {
  messages: ChatMessageView[]
  sources: Record<string, MessageSource[]>
  scopeOptions: ScopeOption[]
  onAsk: (question: string, scope: { documentIds: string[]; folderIds: string[] }) => void
  onOpenSource: (documentId: string) => void
  error?: string | null
}

export function ChatPanel({ messages, sources, scopeOptions, onAsk, onOpenSource, error }: ChatPanelProps) {
  const [question, setQuestion] = useState('')
  const [selected, setSelected] = useState<Record<string, boolean>>({})

  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }))

  const send = () => {
    const q = question.trim()
    if (!q) return
    const documentIds = scopeOptions.filter((o) => o.kind === 'document' && selected[o.id]).map((o) => o.id)
    const folderIds = scopeOptions.filter((o) => o.kind === 'folder' && selected[o.id]).map((o) => o.id)
    onAsk(q, { documentIds, folderIds })
  }

  return (
    <div className="chat-panel">
      {error && <div className="error">{error}</div>}

      <div className="messages">
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="content">{m.content}</div>
            {sources[m.id]?.length > 0 && (
              <ul className="sources">
                {sources[m.id].map((s) => (
                  <li key={s.id}>
                    <button onClick={() => onOpenSource(s.documentId)}>来源：{s.snippet}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {scopeOptions.length > 0 && (
        <fieldset className="scope">
          <legend>限定范围（@文件 / @文件夹）</legend>
          {scopeOptions.map((o) => (
            <label key={o.id}>
              <input type="checkbox" aria-label={o.name} checked={!!selected[o.id]} onChange={() => toggle(o.id)} />
              {o.name}
            </label>
          ))}
        </fieldset>
      )}

      <div className="composer">
        <input
          type="text"
          placeholder="向文档库提问…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button onClick={send}>发送</button>
      </div>
    </div>
  )
}
