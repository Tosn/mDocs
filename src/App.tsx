import { useEffect, useMemo, useState } from 'react'
import type { TreeNode } from '@shared/types'
import { isOk } from '@shared/types'
import { folderApi } from './api/folder.api'
import { searchApi } from './api/search.api'
import { settingsApi } from './api/settings.api'
import { chatApi } from './api/chat.api'
import { useTreeStore } from './stores/tree.store'
import { useChatStore } from './stores/chat.store'
import { FolderTree } from './components/tree/FolderTree'
import { SearchPanel } from './components/search/SearchPanel'
import { ChatPanel } from './components/chat/ChatPanel'

type Turn = { kind: 'user'; id: string; content: string } | { kind: 'assistant'; id: string }

function flattenFolders(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((n) => [n, ...flattenFolders(n.children)])
}

export function App() {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [privacy, setPrivacy] = useState('')
  const [offline, setOffline] = useState(!navigator.onLine)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [convo, setConvo] = useState<Turn[]>([])

  const expanded = useTreeStore((s) => s.expanded)
  const toggle = useTreeStore((s) => s.toggle)
  const select = useTreeStore((s) => s.select)

  const streaming = useChatStore((s) => s.streaming)
  const sources = useChatStore((s) => s.sources)
  const error = useChatStore((s) => s.error)

  useEffect(() => {
    void folderApi.tree().then((r) => isOk(r) && setTree(r.data))
    void settingsApi.getPrivacyNotice().then((r) => isOk(r) && setPrivacy(r.data.text))
    void chatApi.createSession().then((r) => isOk(r) && setSessionId(r.data.id))

    const offToken = chatApi.onToken((p) => {
      useChatStore.getState().appendToken(p.messageId, p.delta)
      setConvo((c) =>
        c.some((t) => t.kind === 'assistant' && t.id === p.messageId)
          ? c
          : [...c, { kind: 'assistant', id: p.messageId }]
      )
    })
    const offSources = chatApi.onSources((p) =>
      useChatStore.getState().setSources(p.messageId, p.sources as never)
    )
    const offError = chatApi.onError((p) => useChatStore.getState().setError(p.message))
    return () => {
      offToken()
      offSources()
      offError()
    }
  }, [])

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  const scopeOptions = useMemo(
    () => flattenFolders(tree).map((f) => ({ id: f.id, name: f.name, kind: 'folder' as const })),
    [tree]
  )

  const messages = convo.map((t) =>
    t.kind === 'user'
      ? { id: t.id, role: 'user' as const, content: t.content }
      : { id: t.id, role: 'assistant' as const, content: streaming[t.id] ?? '' }
  )

  const onAsk = async (question: string, scope: { documentIds: string[]; folderIds: string[] }) => {
    const uid = globalThis.crypto.randomUUID()
    setConvo((c) => [...c, { kind: 'user', id: uid, content: question }])
    if (!sessionId) return
    useChatStore.getState().setError('')
    await chatApi.ask({ sessionId, question, scope })
  }

  return (
    <div className="app">
      {offline && (
        <div className="offline-banner">当前处于离线状态：查看、管理与关键词搜索可用，AI 问答暂不可用。</div>
      )}
      {privacy && <div className="privacy-notice-bar">{privacy}</div>}

      <div className="layout">
        <aside data-testid="pane-tree" className="pane tree">
          <FolderTree
            nodes={tree}
            expanded={expanded}
            onToggle={toggle}
            onSelect={select}
            onDelete={(id) => folderApi.delete(id)}
          />
          <SearchPanel
            onSearch={async (q) => {
              const r = await searchApi.keyword({ query: q })
              return isOk(r) ? r.data : []
            }}
            onOpenHit={(hit) => select(hit.documentId)}
          />
        </aside>

        <main data-testid="pane-main" className="pane main">
          <p className="empty">选择左侧文档以预览</p>
        </main>

        <section data-testid="pane-chat" className="pane chat">
          <ChatPanel
            messages={messages}
            sources={sources}
            scopeOptions={scopeOptions}
            onAsk={onAsk}
            onOpenSource={(documentId) => select(documentId)}
            error={error}
          />
        </section>
      </div>
    </div>
  )
}
