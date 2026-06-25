import type Database from 'better-sqlite3'
import { CHANNELS, EVENTS } from '@shared/channels'
import { isOk, err } from '@shared/types'
import type { IpcLike } from './folder.ipc'
import {
  listSessions,
  createSession,
  getMessages,
  ask,
  type AskDeps
} from '../services/chat.service'
import type { ChatScope } from '../services/rag/scope'

interface IpcEvent {
  sender: { send: (channel: string, payload: unknown) => void }
}

export interface ChatIpcContext {
  db: Database.Database
  /** 由 main 注入：基于 event（用于流式事件回传）+ 当前模型/凭据，构造 ask 所需依赖。 */
  makeAskDeps: (event: IpcEvent) => AskDeps
}

export function registerChatIpc(ipcMain: IpcLike, ctx: ChatIpcContext): void {
  ipcMain.handle(CHANNELS.chat.listSessions, () => listSessions(ctx.db))
  ipcMain.handle(CHANNELS.chat.createSession, () => createSession(ctx.db))
  ipcMain.handle(CHANNELS.chat.getMessages, (_e, sessionId: string) =>
    getMessages(ctx.db, sessionId)
  )
  ipcMain.handle(
    CHANNELS.chat.ask,
    async (event, input: { sessionId: string; question: string; scope?: ChatScope }) => {
      const ev = event as IpcEvent
      try {
        const deps = ctx.makeAskDeps(ev)
        const r = await ask(ctx.db, input, deps)
        // 流式内容已经过事件回传；此处只回 messageId。
        return isOk(r) ? { ok: true as const, data: { messageId: r.data.messageId } } : r
      } catch (e) {
        // 嵌入/流式调用抛错（如 Key 无效、网络失败）：回传错误事件并返回 err，避免 IPC 静默拒绝。
        const message = e instanceof Error ? e.message : '问答失败'
        ev.sender.send(EVENTS.chatError, { messageId: '', code: 'E_CHAT', message })
        return err('E_CHAT', message)
      }
    }
  )
}
