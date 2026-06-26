import { useEffect, useMemo, useRef, useState } from 'react'
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
import { FileTree, type FileNode, type CtxTarget } from './components/tree/FileTree'
import { ContextMenu, type MenuItem } from './components/common/ContextMenu'
import { DocViewer } from './components/viewer/DocViewer'
import { DocEditor } from './components/editor/DocEditor'
import { SearchPanel } from './components/search/SearchPanel'
import { ChatPanel } from './components/chat/ChatPanel'
import { AddWebDialog } from './components/crawl/AddWebDialog'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { TrashPanel } from './components/trash/TrashPanel'
import { PromptDialog } from './components/common/PromptDialog'
import { trashApi } from './api/trash.api'
import { backupApi } from './api/backup.api'

type Turn =
  | { kind: 'user'; id: string; content: string }
  | { kind: 'assistant'; id: string; content?: string }
type DocListItem = { id: string; name: string; type: DocType; folderId: string | null }
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
  const pdfBlobRef = useRef<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [showWeb, setShowWeb] = useState(false)
  const [webTarget, setWebTarget] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showTrash, setShowTrash] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [editReq, setEditReq] = useState<{ key: string; name: string } | null>(null)
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
  const loadAllDocs = () =>
    documentApi.listAll().then((r) => isOk(r) && setDocs(r.data as DocListItem[]))
  // 文件树 = 文件夹 + 全部文档；任何增删改移后统一刷新两者。
  const refreshAll = () => {
    void refreshTree()
    void loadAllDocs()
  }
  const loadSessions = () =>
    chatApi.listSessions().then((r) => {
      if (!isOk(r)) return
      const list = r.data as { id: string; title: string }[]
      setSessions(list.map((s) => ({ id: s.id, title: s.title })))
    })

  useEffect(() => {
    void refreshTree()
    void loadAllDocs()
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

  // 选中文件夹只更新「新建/上传的目标」，不再切换主区列表（文件已在树里）。
  const selectFolder = (id: string | null) => {
    setFolderId(id)
  }

  const revokePdfBlob = () => {
    if (pdfBlobRef.current) {
      URL.revokeObjectURL(pdfBlobRef.current)
      pdfBlobRef.current = null
    }
  }

  const openDocument = async (id: string) => {
    const r = await documentApi.get(id)
    if (!isOk(r)) return
    setOpenDoc(r.data)
    setEditing(false)
    useEditorStore.getState().open(r.data.id, r.data.contentText)
    revokePdfBlob()
    if (r.data.type === 'pdf') {
      // 取字节在渲染层造 Blob URL：同源、可被内置 PDF 查看器渲染（规避 file:// 跨源）。
      const b = await documentApi.getFileBytes(id)
      if (isOk(b)) {
        const bytes = Uint8Array.from(atob(b.data as string), (c) => c.charCodeAt(0))
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        pdfBlobRef.current = url
        setFileUrl(url)
      } else {
        setFileUrl(null)
      }
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

  const createNew = async (target: string | null = folderId) => {
    const name = (await askName('新文档名称'))?.trim()
    if (!name) return
    let r = await documentApi.createDoc({ name, folderId: target, contentText: '' })
    if (!isOk(r) && r.error.code === 'E_DUPLICATE') {
      const s = await documentApi.suggestName({ name, folderId: target })
      if (!isOk(s)) return
      if (!window.confirm(`已存在文档「${name}」，是否改用「${s.data}」？`)) return
      r = await documentApi.createDoc({ name: s.data, folderId: target, contentText: '' })
    }
    if (isOk(r)) refreshAll()
  }

  const createFolder = async (parent: string | null = folderId) => {
    const name = (await askName('新文件夹名称'))?.trim()
    if (!name) return
    const r = await folderApi.create({ name, parentId: parent })
    if (isOk(r)) refreshAll()
  }

  // 内联改名：FileTree 已收集好新名称，这里直接落库。
  const renameFolder = async (id: string, name: string) => {
    const r = await folderApi.rename(id, name)
    if (isOk(r)) refreshAll()
  }

  const renameDoc = async (id: string, name: string) => {
    const r = await documentApi.rename(id, name)
    if (isOk(r)) refreshAll()
  }

  const deleteFolder = async (id: string) => {
    const r = await folderApi.delete(id)
    if (isOk(r)) refreshAll()
  }

  const deleteDoc = async (id: string, name: string) => {
    if (!window.confirm(`确认删除「${name}」？删除后可在回收站保留 7 天。`)) return
    const r = await documentApi.delete(id)
    if (isOk(r)) {
      if (openDoc?.id === id) {
        setOpenDoc(null)
        setFileUrl(null)
        revokePdfBlob()
        useEditorStore.getState().close()
      }
      refreshAll()
    }
  }

  const moveDocTo = async (docId: string, targetFolderId: string | null) => {
    const r = await documentApi.move(docId, targetFolderId)
    if (isOk(r)) refreshAll()
  }

  const uploadFiles = async (target: string | null = folderId) => {
    const picked = await documentApi.pickPaths({ directory: false })
    if (!isOk(picked) || picked.data.length === 0) return
    const r = await documentApi.upload({ paths: picked.data, folderId: target })
    if (!isOk(r)) return
    refreshAll()
    // 有文件被跳过（如解析失败/不支持格式）时给出明确反馈，避免「没反应」。
    const rep = r.data as { added: unknown[]; skipped: { path: string; reason: string }[] }
    if (rep.skipped?.length) {
      const lines = rep.skipped.map((s) => `· ${s.path.split(/[\\/]/).pop()}：${s.reason}`).join('\n')
      window.alert(`已添加 ${rep.added.length} 个，跳过 ${rep.skipped.length} 个：\n${lines}`)
    }
  }

  const uploadFolder = async (target: string | null = folderId) => {
    const picked = await documentApi.pickPaths({ directory: true })
    if (!isOk(picked) || picked.data.length === 0) return
    for (const dirPath of picked.data) await documentApi.uploadFolder({ dirPath, folderId: target })
    refreshAll()
  }

  const exportLibrary = () => void backupApi.export()
  const importLibrary = async () => {
    const r = await backupApi.import()
    if (isOk(r)) refreshAll()
  }

  const addWeb = (target: string | null = folderId) => {
    setWebTarget(target)
    setShowWeb(true)
  }

  const confirmDeleteFolder = (id: string, name: string) => {
    if (window.confirm(`确认删除「${name}」及其全部内容？删除后可在回收站保留 7 天。`)) {
      void deleteFolder(id)
    }
  }

  // 右键菜单：文件夹/默认（根）→ 新建/上传/网页等；文件 → 打开/重命名/删除。
  const openContextMenu = (target: CtxTarget, x: number, y: number) => {
    const items: MenuItem[] = []
    if (target.kind === 'doc') {
      items.push(
        { label: '打开', onClick: () => void openDocument(target.id) },
        { label: '重命名', onClick: () => setEditReq({ key: `d:${target.id}`, name: target.name }) },
        'separator',
        { label: '删除', danger: true, onClick: () => void deleteDoc(target.id, target.name) }
      )
    } else if (target.isDefault) {
      items.push(
        { label: '新建文档', onClick: () => void createNew(null) },
        { label: '上传文件', onClick: () => void uploadFiles(null) },
        { label: '上传文件夹', onClick: () => void uploadFolder(null) },
        { label: '添加网页', onClick: () => addWeb(null) },
        'separator',
        { label: '新建文件夹', onClick: () => void createFolder(null) }
      )
    } else {
      const fid = target.folderId
      items.push(
        { label: '在此新建文档', onClick: () => void createNew(fid) },
        { label: '上传文件到此', onClick: () => void uploadFiles(fid) },
        { label: '上传文件夹到此', onClick: () => void uploadFolder(fid) },
        { label: '添加网页到此', onClick: () => addWeb(fid) },
        { label: '新建子文件夹', onClick: () => void createFolder(fid) },
        'separator',
        { label: '重命名', onClick: () => fid && setEditReq({ key: `f:${fid}`, name: target.name }) },
        { label: '删除', danger: true, onClick: () => fid && confirmDeleteFolder(fid, target.name) }
      )
    }
    setCtxMenu({ x, y, items })
  }

  const openRootMenu = (x: number, y: number) =>
    openContextMenu({ kind: 'folder', folderId: null, name: '默认', isDefault: true }, x, y)

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

  // 统一文件树：默认节点（folderId=null 的未归类文档）+ 各文件夹（含其子文件夹与文档）。
  const fileTree = useMemo<FileNode[]>(() => {
    // 网页爬取的文档正文是 markdown，按 .md 展示；其余按真实类型补扩展名。
    const displayType = (type: DocType): DocType => (type === 'web' ? 'md' : type)
    const withExt = (name: string, type: DocType) => {
      const ext = type === 'md' ? '.md' : type === 'txt' ? '.txt' : type === 'pdf' ? '.pdf' : ''
      return ext && !name.toLowerCase().endsWith(ext) ? `${name}${ext}` : name
    }
    const docNodes = (fid: string | null): FileNode[] =>
      docs
        .filter((d) => d.folderId === fid)
        .map((d) => {
          const t = displayType(d.type)
          return { kind: 'doc' as const, id: d.id, name: withExt(d.name, t), docType: t }
        })
    const folderToNode = (f: TreeNode): FileNode => ({
      kind: 'folder',
      folderId: f.id,
      name: f.name,
      isDefault: false,
      docCount: f.docCount,
      children: [...f.children.map(folderToNode), ...docNodes(f.id)]
    })
    const rootDocs = docNodes(null)
    const defaultNode: FileNode = {
      kind: 'folder',
      folderId: null,
      name: '默认',
      isDefault: true,
      docCount: rootDocs.length,
      children: rootDocs
    }
    return [defaultNode, ...tree.map(folderToNode)]
  }, [tree, docs])

  const messages = convo.map((t) =>
    t.kind === 'user'
      ? { id: t.id, role: 'user' as const, content: t.content }
      : { id: t.id, role: 'assistant' as const, content: streaming[t.id] ?? t.content ?? '' }
  )

  const onAsk = async (question: string, scope: { documentIds: string[]; folderIds: string[] }) => {
    setConvo((c) => [...c, { kind: 'user', id: globalThis.crypto.randomUUID(), content: question }])
    useChatStore.getState().setError('')
    // 懒创建：当前没有会话时先建一个。
    let sid: string | null = sessionId
    if (!sid) {
      const cr = await chatApi.createSession()
      if (!isOk(cr)) {
        useChatStore.getState().setError('无法创建会话')
        return
      }
      sid = (cr.data as { id: string }).id
      setSessionId(sid)
    }
    if (!sid) return
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
    refreshAll()
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
    refreshAll()
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
          <div className="tree-header">
            <span className="tree-title">文档库</span>
            <button
              className="header-btn primary"
              title="新建文档 / 文件夹 / 上传 / 网页"
              onClick={(e) => openRootMenu(e.clientX, e.clientY)}
            >
              ＋ 新建
            </button>
            <button className="header-btn" onClick={openTrash}>
              回收站
            </button>
            <button className="header-btn" onClick={() => setShowSettings(true)}>
              设置
            </button>
          </div>
          <FileTree
            nodes={fileTree}
            expanded={expanded}
            onToggle={toggle}
            selectedFolderId={folderId}
            openDocId={openDoc?.id ?? null}
            onSelectFolder={selectFolder}
            onOpenDoc={(id) => void openDocument(id)}
            onRenameFolder={(id, name) => void renameFolder(id, name)}
            onRenameDoc={(id, name) => void renameDoc(id, name)}
            onMoveDoc={(docId, fid) => void moveDocTo(docId, fid)}
            onContextMenu={openContextMenu}
            onBackgroundContextMenu={openRootMenu}
            editRequest={editReq}
            onEditDone={() => setEditReq(null)}
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
                onExport={exportLibrary}
                onImport={() => void importLibrary()}
                privacyNotice={privacy}
              />
            </div>
          )}

          {showWeb && (
            <AddWebDialog
              onCrawl={(url) => crawlApi.fromUrl({ url, folderId: webTarget })}
              onInteractiveCrawl={(url) => crawlApi.fromUrlInteractive({ url, folderId: webTarget })}
              onClose={() => {
                setShowWeb(false)
                refreshAll()
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
                    setFileUrl(null)
                    revokePdfBlob()
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
            <div className="main-empty">
              <p>
                从左侧选择一个文档查看。
                <br />
                新建 / 上传 / 添加网页：点左上「＋ 新建」，或右键文件夹。
              </p>
            </div>
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

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}
