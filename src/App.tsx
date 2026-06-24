import { useEffect, useMemo, useState } from 'react'
import type { TreeNode, Document, DocType } from '@shared/types'
import { isOk } from '@shared/types'
import { folderApi } from './api/folder.api'
import { documentApi } from './api/document.api'
import { searchApi } from './api/search.api'
import { settingsApi } from './api/settings.api'
import { crawlApi } from './api/crawl.api'
import { chatApi } from './api/chat.api'
import { useTreeStore } from './stores/tree.store'
import { useChatStore } from './stores/chat.store'
import { useEditorStore } from './stores/editor.store'
import { useSettingsStore } from './stores/settings.store'
import { FolderTree } from './components/tree/FolderTree'
import { DocViewer } from './components/viewer/DocViewer'
import { DocEditor } from './components/editor/DocEditor'
import { SearchPanel } from './components/search/SearchPanel'
import { ChatPanel } from './components/chat/ChatPanel'
import { AddWebDialog } from './components/crawl/AddWebDialog'
import { SettingsPanel } from './components/settings/SettingsPanel'

type Turn = { kind: 'user'; id: string; content: string } | { kind: 'assistant'; id: string }
type DocListItem = { id: string; name: string; type: DocType }

function flattenFolders(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((n) => [n, ...flattenFolders(n.children)])
}

const isEditable = (type: DocType) => type !== 'pdf'

export function App() {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [privacy, setPrivacy] = useState('')
  const [offline, setOffline] = useState(!navigator.onLine)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [convo, setConvo] = useState<Turn[]>([])

  const [folderId, setFolderId] = useState<string | null>(null)
  const [docs, setDocs] = useState<DocListItem[]>([])
  const [openDoc, setOpenDoc] = useState<Document | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [showWeb, setShowWeb] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const expanded = useTreeStore((s) => s.expanded)
  const toggle = useTreeStore((s) => s.toggle)
  const streaming = useChatStore((s) => s.streaming)
  const sources = useChatStore((s) => s.sources)
  const error = useChatStore((s) => s.error)
  const draft = useEditorStore((s) => s.draft)
  const dirty = useEditorStore((s) => s.dirty)
  const models = useSettingsStore((s) => s.models)
  const currentModelId = useSettingsStore((s) => s.currentModelId)
  const needKey = useSettingsStore((s) => s.needKey)
  const maskedKey = useSettingsStore((s) => s.maskedKey)

  const refreshTree = () => folderApi.tree().then((r) => isOk(r) && setTree(r.data))
  const loadDocs = (fid: string | null) =>
    documentApi.listByFolder(fid).then((r) => isOk(r) && setDocs(r.data as DocListItem[]))

  useEffect(() => {
    void refreshTree()
    void loadDocs(null)
    void settingsApi.getPrivacyNotice().then((r) => isOk(r) && setPrivacy(r.data.text))
    void settingsApi.listModels().then((r) => isOk(r) && useSettingsStore.getState().setModels(r.data))
    void settingsApi.getActiveModel().then((r) => isOk(r) && r.data && useSettingsStore.getState().setActive(r.data.id))
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

  const selectFolder = (id: string) => {
    setFolderId(id)
    setOpenDoc(null)
    void loadDocs(id)
  }

  const openDocument = async (id: string) => {
    const r = await documentApi.get(id)
    if (!isOk(r)) return
    setOpenDoc(r.data)
    setEditing(false)
    useEditorStore.getState().open(r.data.id, r.data.contentText)
    if (r.data.type === 'pdf') {
      const f = await documentApi.getFileUrl(id)
      setFileUrl(isOk(f) ? f.data : null)
    } else {
      setFileUrl(null)
    }
  }

  const saveDoc = async () => {
    if (!openDoc) return
    const r = await documentApi.updateContent(openDoc.id, draft)
    if (isOk(r)) {
      useEditorStore.getState().markSaved()
      setOpenDoc({ ...openDoc, contentText: draft })
      setEditing(false)
    }
  }

  const createNew = async () => {
    const name = window.prompt('新文档名称')
    if (!name) return
    const r = await documentApi.createDoc({ name, folderId, contentText: '' })
    if (isOk(r)) void loadDocs(folderId)
  }

  const createFolder = async () => {
    const name = window.prompt('新文件夹名称')
    if (!name) return
    const r = await folderApi.create({ name, parentId: folderId })
    if (isOk(r)) void refreshTree()
  }

  const uploadFiles = async () => {
    const picked = await documentApi.pickPaths({ directory: false })
    if (!isOk(picked) || picked.data.length === 0) return
    const r = await documentApi.upload({ paths: picked.data, folderId })
    if (isOk(r)) void loadDocs(folderId)
  }

  const selectModel = (id: string) => {
    useSettingsStore.getState().setActive(id)
    useSettingsStore.getState().setNeedKey(true, null)
  }

  const saveKey = async (apiKey: string) => {
    if (!currentModelId) return
    const sep = currentModelId.indexOf(':')
    const provider = currentModelId.slice(0, sep)
    const modelName = currentModelId.slice(sep + 1)
    const r = await settingsApi.saveModel({ provider, modelName, apiKey })
    if (isOk(r)) {
      useSettingsStore.getState().setNeedKey(false, null)
      setShowSettings(false)
    }
  }

  const scopeOptions = useMemo(
    () => [
      ...flattenFolders(tree).map((f) => ({ id: f.id, name: f.name, kind: 'folder' as const })),
      ...docs.map((d) => ({ id: d.id, name: d.name, kind: 'document' as const }))
    ],
    [tree, docs]
  )

  const messages = convo.map((t) =>
    t.kind === 'user'
      ? { id: t.id, role: 'user' as const, content: t.content }
      : { id: t.id, role: 'assistant' as const, content: streaming[t.id] ?? '' }
  )

  const onAsk = async (question: string, scope: { documentIds: string[]; folderIds: string[] }) => {
    setConvo((c) => [...c, { kind: 'user', id: globalThis.crypto.randomUUID(), content: question }])
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
          <div className="tree-toolbar">
            <button onClick={createFolder}>新建文件夹</button>
            <button onClick={() => setShowSettings(true)}>设置</button>
          </div>
          <FolderTree
            nodes={tree}
            expanded={expanded}
            onToggle={toggle}
            onSelect={selectFolder}
            onDelete={(id) => folderApi.delete(id).then(() => refreshTree())}
            onRename={(id, name) => folderApi.rename(id, name).then(() => refreshTree())}
          />
          <SearchPanel
            onSearch={async (q) => {
              const r = await searchApi.keyword({ query: q })
              return isOk(r) ? r.data : []
            }}
            onOpenHit={(hit) => void openDocument(hit.documentId)}
          />
        </aside>

        <main data-testid="pane-main" className="pane main">
          <div className="toolbar">
            <button onClick={uploadFiles}>上传</button>
            <button onClick={createNew}>新建</button>
            <button onClick={() => setShowWeb(true)}>添加网页</button>
          </div>

          {showSettings && (
            <div data-testid="settings-panel" className="settings-overlay">
              <button onClick={() => setShowSettings(false)}>关闭</button>
              <SettingsPanel
                models={models}
                currentModelId={currentModelId}
                needKey={needKey}
                maskedKey={maskedKey}
                privacyNotice={privacy}
                onSelectModel={selectModel}
                onSaveKey={saveKey}
              />
            </div>
          )}

          {showWeb && (
            <AddWebDialog
              onCrawl={(url) => crawlApi.fromUrl({ url, folderId })}
              onInteractiveCrawl={(url) => crawlApi.fromUrlInteractive({ url, folderId })}
              onClose={() => {
                setShowWeb(false)
                void loadDocs(folderId)
              }}
            />
          )}

          {openDoc ? (
            <div className="doc-open">
              <div className="doc-header">
                <span className="doc-name">{openDoc.name}</span>
                {isEditable(openDoc.type) && !editing && (
                  <button onClick={() => setEditing(true)}>编辑</button>
                )}
                <button
                  onClick={() => {
                    setOpenDoc(null)
                    useEditorStore.getState().close()
                  }}
                >
                  返回
                </button>
              </div>
              {editing && isEditable(openDoc.type) ? (
                <DocEditor
                  value={draft}
                  dirty={dirty}
                  editable
                  onChange={(v) => useEditorStore.getState().setDraft(v)}
                  onSave={saveDoc}
                />
              ) : (
                <DocViewer
                  doc={{
                    type: openDoc.type,
                    name: openDoc.name,
                    contentText: openDoc.contentText,
                    fileUrl
                  }}
                />
              )}
            </div>
          ) : (
            <ul className="doc-list">
              {docs.map((d) => (
                <li key={d.id} onClick={() => void openDocument(d.id)}>
                  {d.name}
                </li>
              ))}
              {docs.length === 0 && <p className="empty">该目录暂无文档</p>}
            </ul>
          )}
        </main>

        <section data-testid="pane-chat" className="pane chat">
          <ChatPanel
            messages={messages}
            sources={sources}
            scopeOptions={scopeOptions}
            onAsk={onAsk}
            onOpenSource={(documentId) => void openDocument(documentId)}
            error={error}
          />
        </section>
      </div>
    </div>
  )
}
