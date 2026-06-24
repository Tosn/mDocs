import { useEffect, useState } from 'react'
import type { TreeNode, Document } from '@shared/types'
import { isOk } from '@shared/types'
import { folderApi } from './api/folder.api'
import { searchApi } from './api/search.api'
import { settingsApi } from './api/settings.api'
import { useTreeStore } from './stores/tree.store'
import { FolderTree } from './components/tree/FolderTree'
import { DocViewer } from './components/viewer/DocViewer'
import { SearchPanel } from './components/search/SearchPanel'
import { ChatPanel } from './components/chat/ChatPanel'

export function App() {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [privacy, setPrivacy] = useState('')
  const [offline, setOffline] = useState(!navigator.onLine)
  const expanded = useTreeStore((s) => s.expanded)
  const toggle = useTreeStore((s) => s.toggle)
  const select = useTreeStore((s) => s.select)

  useEffect(() => {
    void folderApi.tree().then((r) => {
      if (isOk(r)) setTree(r.data)
    })
    void settingsApi.getPrivacyNotice().then((r) => {
      if (isOk(r)) setPrivacy(r.data.text)
    })
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

  const placeholderDoc: Document | null = null

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
          {placeholderDoc ? <DocViewer doc={placeholderDoc as never} /> : <p className="empty">选择左侧文档以预览</p>}
        </main>

        <section data-testid="pane-chat" className="pane chat">
          <ChatPanel
            messages={[]}
            sources={{}}
            scopeOptions={[]}
            onAsk={() => {}}
            onOpenSource={(documentId) => select(documentId)}
          />
        </section>
      </div>
    </div>
  )
}
