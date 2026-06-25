import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import {
  ok,
  err,
  isOk,
  type Result,
  type ChatSession,
  type ChatMessage,
  type MessageSource
} from '@shared/types'
import { retrieve } from './rag/retriever'
import { buildMessages, type ChatMessageInput } from './rag/prompt'
import { resolveScope, type ChatScope } from './rag/scope'

export interface AskDeps {
  embedQuery: (text: string) => Promise<number[]>
  streamChat: (messages: ChatMessageInput[]) => AsyncIterable<string>
  onToken?: (messageId: string, delta: string) => void
  onSources?: (messageId: string, sources: MessageSource[]) => void
  topK?: number
}

function insertMessage(
  db: Database.Database,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  id = randomUUID()
): string {
  const now = Date.now()
  db.prepare(
    `INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, sessionId, role, content, now)
  db.prepare(`UPDATE chat_sessions SET updated_at = ? WHERE id = ?`).run(now, sessionId)
  return id
}

export function createSession(db: Database.Database, title = '新对话'): Result<ChatSession> {
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO chat_sessions (id, title, model_config_id, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)`
  ).run(id, title, now, now)
  return ok({ id, title, modelConfigId: null, createdAt: now, updatedAt: now })
}

export function listSessions(db: Database.Database): Result<ChatSession[]> {
  const rows = db.prepare(`SELECT * FROM chat_sessions ORDER BY updated_at DESC`).all() as {
    id: string
    title: string
    model_config_id: string | null
    created_at: number
    updated_at: number
  }[]
  return ok(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      modelConfigId: r.model_config_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }))
  )
}

export function getMessages(db: Database.Database, sessionId: string): Result<ChatMessage[]> {
  const rows = db
    .prepare(`SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at`)
    .all(sessionId) as {
    id: string
    session_id: string
    role: 'user' | 'assistant'
    content: string
    created_at: number
  }[]
  return ok(
    rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      role: r.role,
      content: r.content,
      createdAt: r.created_at
    }))
  )
}

/**
 * 问答编排（spec E1–E3、E6）：持久化用户消息 → 范围解析 → 检索 → 提示 → 流式 →
 * 持久化回答与来源。空库 / 空范围 / 无召回均给明确回复。
 */
export async function ask(
  db: Database.Database,
  input: { sessionId: string; question: string; scope?: ChatScope },
  deps: AskDeps
): Promise<Result<{ messageId: string; content: string }>> {
  const question = (input.question ?? '').trim()
  if (!question) return err('E_INVALID', '问题不能为空')

  const session = db.prepare(`SELECT id FROM chat_sessions WHERE id = ?`).get(input.sessionId)
  if (!session) return err('E_NOT_FOUND', '会话不存在')

  insertMessage(db, input.sessionId, 'user', question)

  const reply = (content: string): Result<{ messageId: string; content: string }> => {
    const id = insertMessage(db, input.sessionId, 'assistant', content)
    // 提前返回的固定回复也要回传渲染层，否则界面只在收到 token 时才建气泡 → 什么都不显示。
    deps.onToken?.(id, content)
    return ok({ messageId: id, content })
  }

  const docCount = (
    db.prepare(`SELECT COUNT(*) AS n FROM documents WHERE deleted_at IS NULL`).get() as { n: number }
  ).n
  if (docCount === 0) return reply('请先添加文档。')

  const scopeIds = resolveScope(db, input.scope)
  if (scopeIds !== null && scopeIds.length === 0) return reply('所选范围内没有可用文档。')

  const qvec = await deps.embedQuery(question)
  const retrieved = retrieve(db, qvec, {
    topK: deps.topK ?? 5,
    documentIds: scopeIds ?? undefined
  })
  const chunks = isOk(retrieved) ? retrieved.data : []
  if (chunks.length === 0) return reply('未在文档中找到相关内容。')

  const messages = buildMessages({
    question,
    chunks: chunks.map((c) => ({ documentId: c.documentId, chunkId: c.chunkId, text: c.text }))
  })

  const messageId = randomUUID()
  let content = ''
  for await (const delta of deps.streamChat(messages)) {
    content += delta
    deps.onToken?.(messageId, delta)
  }

  // 模型未产出任何 token 时给出回退提示，避免界面出现空白气泡。
  if (content === '') {
    content = '（模型未返回内容）'
    deps.onToken?.(messageId, content)
  }

  insertMessage(db, input.sessionId, 'assistant', content, messageId)

  const sources: MessageSource[] = chunks.map((c) => ({
    id: randomUUID(),
    messageId,
    documentId: c.documentId,
    chunkId: c.chunkId,
    snippet: c.text.slice(0, 200),
    score: c.score
  }))
  const insertSrc = db.prepare(
    `INSERT INTO message_sources (id, message_id, document_id, chunk_id, snippet, score) VALUES (?, ?, ?, ?, ?, ?)`
  )
  for (const s of sources) {
    insertSrc.run(s.id, s.messageId, s.documentId, s.chunkId, s.snippet, s.score)
  }
  deps.onSources?.(messageId, sources)

  return ok({ messageId, content })
}
