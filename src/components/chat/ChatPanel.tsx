import { useRef, useState } from 'react'
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
  modelReady?: boolean
}

const MENTION_RE = /(?:^|\s)@(\S*)$/

export function ChatPanel({
  messages,
  sources,
  scopeOptions,
  onAsk,
  onOpenSource,
  error,
  modelReady = true
}: ChatPanelProps) {
  const [question, setQuestion] = useState('')
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [activeIndex, setActiveIndex] = useState(0)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const mentionMatch = MENTION_RE.exec(question)
  const mentionQuery = mentionMatch ? mentionMatch[1].toLowerCase() : null
  const filtered =
    mentionQuery === null
      ? []
      : scopeOptions.filter((o) => !selected[o.id] && o.name.toLowerCase().includes(mentionQuery))
  const popupOpen = mentionQuery !== null && filtered.length > 0

  const chips = scopeOptions.filter((o) => selected[o.id])

  const autoGrow = () => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }

  const dropMention = (q: string) => q.replace(MENTION_RE, (m) => (m.startsWith('@') ? '' : m[0]))

  const selectOption = (o: ScopeOption) => {
    setSelected((s) => ({ ...s, [o.id]: true }))
    setQuestion(dropMention)
    setActiveIndex(0)
    requestAnimationFrame(() => taRef.current?.focus())
  }

  const removeChip = (id: string) => setSelected((s) => ({ ...s, [id]: false }))

  const send = () => {
    const q = question.trim()
    if (!q || !modelReady) return
    const documentIds = scopeOptions.filter((o) => o.kind === 'document' && selected[o.id]).map((o) => o.id)
    const folderIds = scopeOptions.filter((o) => o.kind === 'folder' && selected[o.id]).map((o) => o.id)
    onAsk(q, { documentIds, folderIds })
    setQuestion('')
    requestAnimationFrame(() => {
      if (taRef.current) taRef.current.style.height = 'auto'
    })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (popupOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % filtered.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length)
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        selectOption(filtered[Math.min(activeIndex, filtered.length - 1)])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setActiveIndex(0)
        setQuestion(dropMention)
      }
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
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

      {!modelReady && (
        <div className="chat-disabled-notice">
          当前未配置 AI 模型，请先在「设置」中配置模型与 API Key。
        </div>
      )}

      {modelReady && chips.length > 0 && (
        <div className="scope-chips">
          {chips.map((o) => (
            <span key={o.id} className="scope-chip" data-kind={o.kind}>
              {o.name}
              <button aria-label={`移除 ${o.name}`} onClick={() => removeChip(o.id)}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="composer">
        {modelReady && popupOpen && (
          <ul className="mention-popup">
            {filtered.map((o, i) => (
              <li key={o.id}>
                <button
                  className={`mention-option${i === activeIndex ? ' active' : ''}`}
                  data-kind={o.kind}
                  aria-label={o.name}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectOption(o)}
                >
                  {o.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          ref={taRef}
          rows={1}
          placeholder={modelReady ? '向文档库提问…（输入 @ 限定文件/文件夹）' : '请先配置 AI 模型'}
          value={question}
          disabled={!modelReady}
          onChange={(e) => {
            setQuestion(e.target.value)
            setActiveIndex(0)
            autoGrow()
          }}
          onKeyDown={onKeyDown}
        />
        <button onClick={send} disabled={!modelReady}>
          发送
        </button>
      </div>
    </div>
  )
}
