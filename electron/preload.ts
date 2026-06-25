import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, EVENTS } from '@shared/channels'

type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>
type Subscribe = (event: string, listener: (payload: unknown) => void) => () => void

/** 构建暴露给渲染进程的 window.api（invoke/on 可注入，便于测试）。 */
export function buildApi(invoke: Invoke, on: Subscribe) {
  return {
    folder: {
      list: (parentId: string | null) => invoke(CHANNELS.folder.list, parentId),
      tree: () => invoke(CHANNELS.folder.tree),
      create: (input: unknown) => invoke(CHANNELS.folder.create, input),
      rename: (id: string, name: string) => invoke(CHANNELS.folder.rename, id, name),
      delete: (id: string) => invoke(CHANNELS.folder.delete, id)
    },
    document: {
      listByFolder: (folderId: string | null) => invoke(CHANNELS.document.listByFolder, folderId),
      get: (id: string) => invoke(CHANNELS.document.get, id),
      getFileUrl: (id: string) => invoke(CHANNELS.document.getFileUrl, id),
      pickPaths: (opts: { directory?: boolean }) => invoke(CHANNELS.document.pickPaths, opts),
      upload: (input: unknown) => invoke(CHANNELS.document.upload, input),
      importFolder: (input: unknown) => invoke(CHANNELS.document.importFolder, input),
      createDoc: (input: unknown) => invoke(CHANNELS.document.createDoc, input),
      suggestName: (input: { name: string; folderId: string | null }) =>
        invoke(CHANNELS.document.suggestName, input),
      updateContent: (id: string, contentText: string) =>
        invoke(CHANNELS.document.updateContent, id, contentText),
      rename: (id: string, name: string) => invoke(CHANNELS.document.rename, id, name),
      delete: (id: string) => invoke(CHANNELS.document.delete, id)
    },
    search: {
      keyword: (input: unknown) => invoke(CHANNELS.search.keyword, input)
    },
    trash: {
      list: () => invoke(CHANNELS.trash.list),
      restore: (id: string) => invoke(CHANNELS.trash.restore, id),
      purge: (id: string) => invoke(CHANNELS.trash.purge, id)
    },
    crawl: {
      fromUrl: (input: unknown) => invoke(CHANNELS.crawl.fromUrl, input),
      fromUrlInteractive: (input: unknown) => invoke(CHANNELS.crawl.fromUrlInteractive, input)
    },
    chat: {
      listSessions: () => invoke(CHANNELS.chat.listSessions),
      createSession: () => invoke(CHANNELS.chat.createSession),
      getMessages: (sessionId: string) => invoke(CHANNELS.chat.getMessages, sessionId),
      ask: (input: unknown) => invoke(CHANNELS.chat.ask, input)
    },
    settings: {
      listModels: () => invoke(CHANNELS.settings.listModels),
      getActiveModel: () => invoke(CHANNELS.settings.getActiveModel),
      switchModel: (id: string) => invoke(CHANNELS.settings.switchModel, id),
      saveModel: (input: unknown) => invoke(CHANNELS.settings.saveModel, input),
      testModel: (id: string) => invoke(CHANNELS.settings.testModel, id),
      getPrivacyNotice: () => invoke(CHANNELS.settings.getPrivacyNotice)
    },
    on: (event: string, listener: (payload: unknown) => void) => on(event, listener),
    EVENTS
  }
}

const api = buildApi(
  (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  (event, listener) => {
    const handler = (_e: unknown, payload: unknown) => listener(payload)
    ipcRenderer.on(event, handler)
    return () => ipcRenderer.removeListener(event, handler)
  }
)

contextBridge.exposeInMainWorld('api', api)

export type MDocsApi = ReturnType<typeof buildApi>
