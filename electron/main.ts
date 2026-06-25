import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { EVENTS } from '@shared/channels'
import { isOk } from '@shared/types'
import { openDb } from './db/index'
import { purgeExpiredTrash } from './startup/trash-gc'
import { registerFolderIpc, type IpcLike } from './ipc/folder.ipc'
import { registerDocumentIpc } from './ipc/document.ipc'
import { registerSearchIpc } from './ipc/search.ipc'
import { registerTrashIpc } from './ipc/trash.ipc'
import { registerCrawlIpc } from './ipc/crawl.ipc'
import { registerChatIpc } from './ipc/chat.ipc'
import { registerSettingsIpc } from './ipc/settings.ipc'
import type { AskDeps } from './services/chat.service'
import { chatStream, embed } from './services/llm/provider'
import type { EmbedFn } from './services/rag/embedder'
import { getModel } from './services/llm/registry'
import { getKey } from './services/credential.service'

interface IpcEvent {
  sender: { send: (channel: string, payload: unknown) => void }
}

export interface BootstrapCtx {
  storageDir?: string
  makeAskDeps: (event: IpcEvent) => AskDeps
  /** 用激活嵌入模型的批量嵌入函数；驱动导入后索引与「重建索引」。 */
  embed?: EmbedFn
}

/** 注册全部 IPC 域并执行启动清理。可独立测试（注入 fake ipcMain）。 */
export function bootstrap(ipcMain: IpcLike, db: Database.Database, ctx: BootstrapCtx): void {
  registerFolderIpc(ipcMain, db)
  registerDocumentIpc(ipcMain, db, { storageDir: ctx.storageDir, embed: ctx.embed })
  registerSearchIpc(ipcMain, db)
  registerTrashIpc(ipcMain, db)
  registerCrawlIpc(ipcMain, db, { storageDir: ctx.storageDir, embed: ctx.embed })
  registerChatIpc(ipcMain, { db, makeAskDeps: ctx.makeAskDeps })
  registerSettingsIpc(ipcMain, db, { embed: ctx.embed })

  // spec B3：启动时彻底删除过期回收站项。
  purgeExpiredTrash(db)
}

interface ActiveModel {
  provider: string
  modelName: string
  baseUrl: string | null
  apiKey: string
}

interface ModelRow {
  provider: string
  model_name: string
  base_url: string | null
  key_ref: string
}

function toActive(db: Database.Database, row: ModelRow | undefined): ActiveModel | null {
  if (!row) return null
  const key = getKey(db, row.key_ref)
  if (!isOk(key)) return null
  // base_url 为空（旧配置行/仅激活未更新）时按注册表兜底，避免回退到 OpenAI 端点。
  const baseUrl = row.base_url ?? getModel(`${row.provider}:${row.model_name}`)?.baseUrl ?? null
  return { provider: row.provider, modelName: row.model_name, baseUrl, apiKey: key.data }
}

function getActive(db: Database.Database): ActiveModel | null {
  const row = db.prepare(`SELECT * FROM model_configs WHERE is_active = 1 LIMIT 1`).get() as
    | ModelRow
    | undefined
  return toActive(db, row)
}

/** 激活的嵌入模型（与对话模型解耦，存于 settings.active_embed_config）。 */
function getActiveEmbed(db: Database.Database): ActiveModel | null {
  const s = db.prepare(`SELECT value FROM settings WHERE key = 'active_embed_config'`).get() as
    | { value: string }
    | undefined
  if (!s) return null
  const row = db.prepare(`SELECT * FROM model_configs WHERE id = ?`).get(s.value) as
    | ModelRow
    | undefined
  return toActive(db, row)
}

/** 用激活的嵌入模型构造批量嵌入函数（文档索引与查询嵌入共用）。无嵌入模型或失败均抛错。 */
export function makeEmbedFn(db: Database.Database): EmbedFn {
  return async (texts) => {
    const m = getActiveEmbed(db)
    if (!m) throw new Error('未配置嵌入模型，请在设置中配置「嵌入模型」与其 API Key')
    const r = await embed({
      model: m.modelName,
      apiKey: m.apiKey,
      baseUrl: m.baseUrl ?? undefined,
      texts
    })
    if (!isOk(r)) throw new Error(r.error.message)
    return r.data
  }
}

/** 默认 ask 依赖：用当前激活模型 + 凭据驱动嵌入与流式聊天，并把进度回传渲染层。 */
export function defaultMakeAskDeps(db: Database.Database): (event: IpcEvent) => AskDeps {
  const embedFn = makeEmbedFn(db)
  return (event) => ({
    // 嵌入失败时抛错（向上经 chat:error 显示），避免静默返回空向量导致回答空白。
    embedQuery: async (text) => (await embedFn([text]))[0],
    streamChat: async function* (messages) {
      const m = getActive(db)
      if (!m) throw new Error('未配置可用模型')
      yield* chatStream({
        model: m.modelName,
        apiKey: m.apiKey,
        baseUrl: m.baseUrl ?? undefined,
        messages
      })
    },
    onToken: (messageId, delta) => event.sender.send(EVENTS.chatToken, { messageId, delta }),
    onSources: (messageId, sources) => event.sender.send(EVENTS.chatSources, { messageId, sources })
  })
}

async function startApp(): Promise<void> {
  const { app, BrowserWindow, ipcMain } = await import('electron')
  await app.whenReady()

  const userData = app.getPath('userData')
  const db = openDb(join(userData, 'mdocs.sqlite'))
  const storageDir = join(userData, 'documents')

  bootstrap(ipcMain as unknown as IpcLike, db, {
    storageDir,
    makeAskDeps: defaultMakeAskDeps(db),
    embed: makeEmbedFn(db)
  })

  const createWindow = () => {
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true }
    })
    if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
    else win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

if (process.env.NODE_ENV !== 'test') {
  void startApp()
}
