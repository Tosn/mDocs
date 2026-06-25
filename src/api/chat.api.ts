import type { MDocsApi } from '@electron/preload'
import type { ChatScope } from '@electron/services/rag/scope'

const bridge = (): MDocsApi => (window as unknown as { api: MDocsApi }).api

export const chatApi = {
  listSessions: () => bridge().chat.listSessions(),
  createSession: () => bridge().chat.createSession(),
  deleteSession: (sessionId: string) => bridge().chat.deleteSession(sessionId),
  getMessages: (sessionId: string) => bridge().chat.getMessages(sessionId),
  getSources: (sessionId: string) => bridge().chat.getSources(sessionId),
  ask: (input: { sessionId: string; question: string; scope?: ChatScope }) =>
    bridge().chat.ask(input),
  onToken: (cb: (payload: { messageId: string; delta: string }) => void) =>
    bridge().on('chat:token', cb as (p: unknown) => void),
  onSources: (cb: (payload: { messageId: string; sources: unknown[] }) => void) =>
    bridge().on('chat:sources', cb as (p: unknown) => void),
  onError: (cb: (payload: { messageId: string; code: string; message: string }) => void) =>
    bridge().on('chat:error', cb as (p: unknown) => void)
}
