import { useEffect, useMemo, useState } from 'react'
import type { TreeNode, Document, DocType, MessageSource } from '@shared/types'
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
import { TrashPanel } from './components/trash/TrashPanel'
import { PromptDialog } from './components/common/PromptDialog'
import { trashApi } from './api/trash.api'

type Turn =
  | { kind: 'user'; id: string; content: string }
  | { kind: 'assistant'; id: string; content?: string }
type DocListItem = { id: string; name: string; type: DocType }
type SessionItem = { id: string; title: string }

function flattenFolders(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((n) => [n, ...flattenFolders(n.children)])
}

const isEditable = (type: DocType) => type !== 'pdf'

export function App() {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [privacy, setPrivacy] = useState('')
  const [offline, setOffline] = useState(!navigator.onLine)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [convo, setConvo] = useState<Turn[]>([])
  const [modelReady, setModelReady] = useState(false)
  const [embedReady, setEmbedReady] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const [asking, setAsking] = useState(false)

  const [folderId, setFolderId] = useState<string | null>(null)
  const [docs, setDocs] = useState<DocListItem[]>([])
  const [openDoc, setOpenDoc] = useState<Document | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [showWeb, setShowWeb] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showTrash, setShowTrash] = useState(false)
  const [moveMenu, setMoveMenu] = useState<{ docId: string; x: number; y: number } | null>(null)
  const [trashItems, setTrashItems] = useState<
    { id: string; itemType: 'folder' | 'document'; name: string; deletedAt: number; purgeAfter: number }[]
  >([])
  const [namePrompt, setNamePrompt] = useState<{
    title: string
    defaultValue: string
    resolve: (value: string | null) => void
  } | null>(null)

  const expanded = useTreeStore((s) => s.expanded)
  const toggle = useTreeStore((s) => s.toggle)
  const streaming = useChatStore((s) => s.streaming)
  const sources = useChatStore((s) => s.sources)
  const error = useChatStore((s) => s.error)
  const draft = useEditorStore((s) => s.draft)
  const dirty = useEditorStore((s) => s.dirty)
  const models = useSettingsStore((s) => s.models)
  const currentModelId = useSettingsStore((s) => s.currentModelId)
  const currentConfigId = useSettingsStore((s) => s.currentConfigId)
  const needKey = useSettingsStore((s) => s.needKey)
  const maskedKey = useSettingsStore((s) => s.maskedKey)
  const currentEmbedId = useSettingsStore((s) => s.currentEmbedId)
  const embedConfigId = useSettingsStore((s) => s.embedConfigId)
  const embedNeedKey = useSettingsStore((s) => s.embedNeedKey)
  const embedMaskedKey = useSettingsStore((s) => s.embedMaskedKey)

  const refreshTree = () => folderApi.tree().then((r) => isOk(r) && setTree(r.data))
  const loadDocs = (fid: string | null) =>
    documentApi.listByFolder(fid).then((r) => isOk(r) && setDocs(r.data as DocListItem[]))
  const loadSessions = () =>
    chatApi.listSessions().then((r) => {
      if (!isOk(r)) return
      const list = r.data as { id: string; title: string }[]
      setSessions(list.map((s) => ({ id: s.id, title: s.title })))
    })

  useEffect(() => {
    void refreshTree()
    void loadDocs(null)
    void settingsApi.getPrivacyNotice().then((r) => isOk(r) && setPrivacy(r.data.text))
    void settingsApi.listModels().then((r) => isOk(r) && useSettingsStore.getState().setModels(r.data))
    void settingsApi.getActiveModel().then((r) => {
      if (isOk(r) && r.data) {
        // 统一用注册表 id（provider:modelName），与选择/保存逻辑一致，
        // 也便于按 id 取模型 label；r.data.id 是数据库 UUID，不能直接用。
        useSettingsStore.getState().setActive(`${r.data.provider}:${r.data.modelName}`)
        setModelReady(true)
      }
    })
    void settingsApi.getActiveEmbedModel().then((r) => {
      if (isOk(r) && r.data) {
        useSettingsStore.getState().setActiveEmbed(`${r.data.provider}:${r.data.modelName}`)
        useSettingsStore.getState().setEmbedConfigId(r.data.id)
        setEmbedReady(true)
      }
    })
    // 懒创建会话：不在挂载时建空会话（否则会积累空「新对话」），首次提问时才建。
    void loadSessions()

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

  const selectFolder = (id: string | null) => {
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

  const askName = (title: string, defaultValue = '') =>
    new Promise<string | null>((resolve) => setNamePrompt({ title, defaultValue, resolve }))

  const createNew = async () => {
    const name = (await askName('新文档名称'))?.trim()
    if (!name) return
    let r = await documentApi.createDoc({ name, folderId, contentText: '' })
    if (!isOk(r) && r.error.code === 'E_DUPLICATE') {
      const s = await documentApi.suggestName({ name, folderId })
      if (!isOk(s)) return
      if (!window.confirm(`已存在文档「${name}」，是否改用「${s.data}」？`)) return
      r = await documentApi.createDoc({ name: s.data, folderId, contentText: '' })
    }
    if (isOk(r)) void loadDocs(folderId)
  }

  const createFolder = async () => {
    const name = (await askName('新文件夹名称'))?.trim()
    if (!name) return
    const r = await folderApi.create({ name, parentId: folderId })
    if (isOk(r)) void refreshTree()
  }

  const renameFolder = async (id: string, currentName: string) => {
    const name = (await askName('新名称', currentName))?.trim()
    if (!name) return
    const r = await folderApi.rename(id, name)
    if (isOk(r)) void refreshTree()
  }

  const renameDoc = async (id: string, currentName: string) => {
    const name = (await askName('新名称', currentName))?.trim()
    if (!name) return
    const r = await documentApi.rename(id, name)
    if (isOk(r)) void loadDocs(folderId)
  }

  const deleteDoc = async (id: string, name: string) => {
    if (!window.confirm(`确认删除「${name}」？删除后可在回收站保留 7 天。`)) return
    const r = await documentApi.delete(id)
    if (isOk(r)) {
      if (openDoc?.id === id) {
        setOpenDoc(null)
        useEditorStore.getState().close()
      }
      void loadDocs(folderId)
    }
  }

  const moveDocTo = async (docId: string, targetFolderId: string | null) => {
    const r = await documentApi.move(docId, targetFolderId)
    if (!isOk(r)) return
    void refreshTree() // 计数变化
    void loadDocs(folderId)
    setMoveMenu(null)
  }

  const uploadFiles = async () => {
    const picked = await documentApi.pickPaths({ directory: false })
    if (!isOk(picked) || picked.data.length === 0) return
    const r = await documentApi.upload({ paths: picked.data, folderId })
    if (isOk(r)) void loadDocs(folderId)
  }

  const selectModel = async (id: string) => {
    const sep = id.indexOf(':')
    const provider = id.slice(0, sep)
    const modelName = id.slice(sep + 1)
    // 先同步展示 Key 区（空）并置为不可用，再异步回填密文 Key / 可用状态。
    useSettingsStore.getState().setActive(id)
    useSettingsStore.getState().setNeedKey(true, null)
    useSettingsStore.getState().setConfigId(null)
    setModelReady(false)
    const r = await settingsApi.selectModel({ provider, modelName })
    if (!isOk(r)) return
    useSettingsStore.getState().setNeedKey(true, r.data.maskedKey)
    useSettingsStore.getState().setConfigId(r.data.configId)
    // 未配置 Key 的模型不可用：对话保持 disabled，上方提示「没有可用模型」。
    setModelReady(r.data.configured)
  }

  const saveKey = async (apiKey: string) => {
    if (!currentModelId) return
    // 未改动密文（apiKey 仍等于回显的 maskedKey）且已有配置：仅激活，不重存 Key。
    if (maskedKey !== null && apiKey === maskedKey && currentConfigId) {
      const r = await settingsApi.switchModel(currentConfigId)
      if (isOk(r)) {
        useSettingsStore.getState().setNeedKey(false, null)
        setModelReady(true)
        setShowSettings(false)
      }
      return
    }
    const sep = currentModelId.indexOf(':')
    const provider = currentModelId.slice(0, sep)
    const modelName = currentModelId.slice(sep + 1)
    const r = await settingsApi.saveModel({ provider, modelName, apiKey })
    if (isOk(r)) {
      useSettingsStore.getState().setConfigId(r.data.id)
      useSettingsStore.getState().setNeedKey(false, null)
      setModelReady(true)
      setShowSettings(false)
    }
  }

  const selectEmbed = async (id: string) => {
    const sep = id.indexOf(':')
    const provider = id.slice(0, sep)
    const modelName = id.slice(sep + 1)
    useSettingsStore.getState().setActiveEmbed(id)
    useSettingsStore.getState().setEmbedNeedKey(true, null)
    useSettingsStore.getState().setEmbedConfigId(null)
    setEmbedReady(false)
    const r = await settingsApi.selectModel({ provider, modelName, role: 'embedding' })
    if (!isOk(r)) return
    useSettingsStore.getState().setEmbedNeedKey(true, r.data.maskedKey)
    useSettingsStore.getState().setEmbedConfigId(r.data.configId)
    setEmbedReady(r.data.configured)
  }

  const reindex = async () => {
    setReindexing(true)
    try {
      await settingsApi.reindex()
    } finally {
      setReindexing(false)
    }
  }

  const saveEmbedKey = async (apiKey: string) => {
    if (!currentEmbedId) return
    const sep = currentEmbedId.indexOf(':')
    const provider = currentEmbedId.slice(0, sep)
    const modelName = currentEmbedId.slice(sep + 1)
    // 未改动密文且已配置：重新激活该嵌入模型即可（不重存 Key）。
    if (embedMaskedKey !== null && apiKey === embedMaskedKey && embedConfigId) {
      const r = await settingsApi.selectModel({ provider, modelName, role: 'embedding' })
      if (isOk(r)) {
        useSettingsStore.getState().setEmbedNeedKey(false, null)
        setEmbedReady(true)
        setShowSettings(false)
      }
      return
    }
    const r = await settingsApi.saveModel({ provider, modelName, apiKey, role: 'embedding' })
    if (isOk(r)) {
      useSettingsStore.getState().setEmbedConfigId(r.data.id)
      useSettingsStore.getState().setEmbedNeedKey(false, null)
      setEmbedReady(true)
      setShowSettings(false)
      // 嵌入模型/维度可能变，重建全部文档索引。
      void reindex()
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
      : { id: t.id, role: 'assistant' as const, content: streaming[t.id] ?? t.content ?? '' }
  )

  const onAsk = async (question: string, scope: { documentIds: string[]; folderIds: string[] }) => {
    setConvo((c) => [...c, { kind: 'user', id: globalThis.crypto.randomUUID(), content: question }])
    useChatStore.getState().setError('')
    // 懒创建：当前没有会话时先建一个。
    let sid = sessionId
    if (!sid) {
      const cr = await chatApi.createSession()
      if (!isOk(cr)) {
        useChatStore.getState().setError('无法创建会话')
        return
      }
      sid = cr.data.id
      setSessionId(sid)
    }
    setAsking(true)
    try {
      const r = (await chatApi.ask({ sessionId: sid, question, scope })) as
        | { ok: true }
        | { ok: false; error: { message: string } }
      if (r && r.ok === false) useChatStore.getState().setError(r.error.message)
    } catch {
      useChatStore.getState().setError('问答失败，请稍后重试。')
    } finally {
      setAsking(false)
      void loadSessions() // 标题/排序可能因本次提问更新
    }
  }

  const newSession = () => {
    // 懒创建：仅清空当前会话状态，下次提问时才落库，避免空会话堆积。
    setSessionId(null)
    setConvo([])
    useChatStore.getState().clear()
  }

  const removeSession = async (id: string) => {
    if (!window.confirm('确认删除该会话？删除后无法恢复。')) return
    const r = await chatApi.deleteSession(id)
    if (!isOk(r)) return
    if (id === sessionId) newSession()
    void loadSessions()
  }

  const loadTrash = () =>
    trashApi.list().then((r) => {
      if (!isOk(r)) return
      setTrashItems(
        r.data as {
          id: string
          itemType: 'folder' | 'document'
          name: string
          deletedAt: number
          purgeAfter: number
        }[]
      )
    })

  const openTrash = () => {
    setShowTrash(true)
    void loadTrash()
  }

  const restoreTrash = async (id: string) => {
    const r = await trashApi.restore(id)
    if (!isOk(r)) return
    await loadTrash()
    void refreshTree()
    void loadDocs(folderId)
  }

  const purgeTrash = async (id: string) => {
    if (!window.confirm('彻底删除后无法恢复，确认？')) return
    const r = await trashApi.purge(id)
    if (isOk(r)) void loadTrash()
  }

  const restoreMany = async (ids: string[]) => {
    for (const id of ids) await trashApi.restore(id)
    await loadTrash()
    void refreshTree()
    void loadDocs(folderId)
  }

  const purgeMany = async (ids: string[]) => {
    if (!window.confirm(`彻底删除选中的 ${ids.length} 项？删除后无法恢复。`)) return
    for (const id of ids) await trashApi.purge(id)
    void loadTrash()
  }

  const switchSession = async (id: string) => {
    if (id === sessionId) return
    const r = await chatApi.getMessages(id)
    if (!isOk(r)) return
    setSessionId(id)
    useChatStore.getState().clear()
    const msgs = r.data as { id: string; role: 'user' | 'assistant'; content: string }[]
    setConvo(
      msgs.map((m) =>
        m.role === 'user'
          ? { kind: 'user' as const, id: m.id, content: m.content }
          : { kind: 'assistant' as const, id: m.id, content: m.content }
      )
    )
    // 回填该会话各消息的来源（含文档名），否则历史会话看不到来源。
    const sr = await chatApi.getSources(id)
    if (isOk(sr)) {
      const store = useChatStore.getState()
      const byMsg = new Map<string, MessageSource[]>()
      for (const s of sr.data as MessageSource[]) {
        const list = byMsg.get(s.messageId) ?? []
        list.push(s)
        byMsg.set(s.messageId, list)
      }
      for (const [mid, list] of byMsg) store.setSources(mid, list)
    }
  }

  return (
    <div className="app">
      {offline && (
        <div className="offline-banner">当前处于离线状态：查看、管理与关键词搜索可用，AI 问答暂不可用。</div>
      )}
      {privacy && <div className="privacy-notice-bar">{privacy}</div>}
      {reindexing && <div className="privacy-notice-bar">正在重建文档索引…</div>}

      <div className="layout">
        <aside data-testid="pane-tree" className="pane tree">
          <div className="tree-toolbar">
            <button onClick={createFolder}>新建文件夹</button>
            <button onClick={openTrash}>回收站</button>
            <button onClick={() => setShowSettings(true)}>设置</button>
          </div>
          <button
            className={`tree-root-entry${folderId === null ? ' active' : ''}`}
            onClick={() => selectFolder(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const docId = e.dataTransfer.getData('text/doc-id')
              if (docId) void moveDocTo(docId, null)
            }}
          >
            全部文档
          </button>
          <FolderTree
            nodes={tree}
            expanded={expanded}
            onToggle={toggle}
            onSelect={selectFolder}
            onDelete={(id) => folderApi.delete(id).then(() => refreshTree())}
            onRename={(id, currentName) => void renameFolder(id, currentName)}
            onMoveDoc={(docId, fid) => void moveDocTo(docId, fid)}
            selectedId={folderId}
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

          {showTrash && (
            <div data-testid="trash-panel" className="settings-overlay">
              <button onClick={() => setShowTrash(false)}>关闭</button>
              <TrashPanel
                items={trashItems}
                onRestore={restoreTrash}
                onPurge={purgeTrash}
                onRestoreMany={(ids) => void restoreMany(ids)}
                onPurgeMany={(ids) => void purgeMany(ids)}
              />
            </div>
          )}

          {showSettings && (
            <div data-testid="settings-panel" className="settings-overlay">
              <button onClick={() => setShowSettings(false)}>关闭</button>
              <SettingsPanel
                models={models}
                currentModelId={currentModelId}
                needKey={needKey}
                maskedKey={maskedKey}
                onSelectModel={selectModel}
                onSaveKey={saveKey}
                currentEmbedId={currentEmbedId}
                embedNeedKey={embedNeedKey}
                embedMaskedKey={embedMaskedKey}
                onSelectEmbed={selectEmbed}
                onSaveEmbedKey={saveEmbedKey}
                onReindex={() => void reindex()}
                reindexing={reindexing}
                privacyNotice={privacy}
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
                <li
                  key={d.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/doc-id', d.id)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMoveMenu({ docId: d.id, x: e.clientX, y: e.clientY })
                  }}
                >
                  <span className="doc-name" onClick={() => void openDocument(d.id)}>
                    {d.name}
                  </span>
                  <button aria-label={`移动 ${d.name}`} onClick={(e) => setMoveMenu({ docId: d.id, x: e.clientX, y: e.clientY })}>
                    移动
                  </button>
                  <button aria-label={`重命名 ${d.name}`} onClick={() => void renameDoc(d.id, d.name)}>
                    改名
                  </button>
                  <button aria-label={`删除 ${d.name}`} onClick={() => void deleteDoc(d.id, d.name)}>
                    删除
                  </button>
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
            modelReady={modelReady}
            modelLabel={models.find((m) => m.id === currentModelId)?.label ?? currentModelId}
            thinking={asking}
            embedReady={embedReady}
            sessions={sessions}
            currentSessionId={sessionId}
            onNewSession={newSession}
            onSelectSession={(id) => void switchSession(id)}
            onDeleteSession={(id) => void removeSession(id)}
          />
        </section>
      </div>

      {namePrompt && (
        <PromptDialog
          title={namePrompt.title}
          defaultValue={namePrompt.defaultValue}
          onSubmit={(value) => {
            namePrompt.resolve(value)
            setNamePrompt(null)
          }}
          onCancel={() => {
            namePrompt.resolve(null)
            setNamePrompt(null)
          }}
        />
      )}

      {moveMenu && (
        <div
          className="context-menu-backdrop"
          onClick={() => setMoveMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault()
            setMoveMenu(null)
          }}
        >
          <div
            className="context-menu"
            style={{ top: moveMenu.y, left: moveMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="context-menu-title">移动到</div>
            <button onClick={() => void moveDocTo(moveMenu.docId, null)}>全部文档（根目录）</button>
            {flattenFolders(tree).map((f) => (
              <button key={f.id} onClick={() => void moveDocTo(moveMenu.docId, f.id)}>
                {f.name}
              </button>
            ))}
            {tree.length === 0 && <div className="context-menu-empty">暂无文件夹</div>}
          </div>
        </div>
      )}
    </div>
  )
}
