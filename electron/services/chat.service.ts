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
  // 只列出已有消息的会话，隐藏从未用过的空「新对话」。
  const rows = db
    .prepare(
      `SELECT s.* FROM chat_sessions s
       WHERE EXISTS (SELECT 1 FROM chat_messages m WHERE m.session_id = s.id)
       ORDER BY s.updated_at DESC`
    )
    .all() as {
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

export function deleteSession(db: Database.Database, sessionId: string): Result<void> {
  const tx = db.transaction(() => {
    db.prepare(
      `DELETE FROM message_sources WHERE message_id IN
         (SELECT id FROM chat_messages WHERE session_id = ?)`
    ).run(sessionId)
    db.prepare(`DELETE FROM chat_messages WHERE session_id = ?`).run(sessionId)
    db.prepare(`DELETE FROM chat_sessions WHERE id = ?`).run(sessionId)
  })
  tx()
  return ok(undefined)
}

/** 取某会话所有消息的来源（带文档名），用于历史会话重载时回填来源展示。 */
export function getSources(db: Database.Database, sessionId: string): Result<MessageSource[]> {
  const rows = db
    .prepare(
      `SELECT ms.id, ms.message_id, ms.document_id, ms.chunk_id, ms.snippet, ms.score, d.name AS document_name
       FROM message_sources ms
       JOIN chat_messages cm ON cm.id = ms.message_id
       LEFT JOIN documents d ON d.id = ms.document_id
       WHERE cm.session_id = ?`
    )
    .all(sessionId) as {
    id: string
    message_id: string
    document_id: string
    chunk_id: string
    snippet: string
    score: number
    document_name: string | null
  }[]
  return ok(
    rows.map((r) => ({
      id: r.id,
      messageId: r.message_id,
      documentId: r.document_id,
      chunkId: r.chunk_id,
      snippet: r.snippet,
      score: r.score,
      documentName: r.document_name ?? '未知文档'
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

  // 首条提问作为会话标题，便于历史会话列表辨识。
  const isFirst =
    (db.prepare(`SELECT COUNT(*) AS n FROM chat_messages WHERE session_id = ?`).get(input.sessionId) as {
      n: number
    }).n === 0
  insertMessage(db, input.sessionId, 'user', question)
  if (isFirst) {
    const title = question.length > 40 ? `${question.slice(0, 40)}…` : question
    db.prepare(`UPDATE chat_sessions SET title = ? WHERE id = ?`).run(title, input.sessionId)
  }

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

  // 模型判定「未找到」时，召回片段只是低相关度噪声，不作为来源展示/持久化。
  const notFound = /未在文档中找到相关内容|未找到相关(内容|信息)/.test(content)
  if (!notFound) {
    // 按文档去重：同一文档多个命中片段只保留分数最高的一条，来源直接展示文档标题。
    const docName = db.prepare(`SELECT name FROM documents WHERE id = ?`)
    const seen = new Set<string>()
    const sources: MessageSource[] = []
    for (const c of chunks) {
      if (seen.has(c.documentId)) continue
      seen.add(c.documentId)
      const nameRow = docName.get(c.documentId) as { name: string } | undefined
      sources.push({
        id: randomUUID(),
        messageId,
        documentId: c.documentId,
        chunkId: c.chunkId,
        snippet: c.text.slice(0, 200),
        score: c.score,
        documentName: nameRow?.name ?? '未知文档'
      })
    }
    const insertSrc = db.prepare(
      `INSERT INTO message_sources (id, message_id, document_id, chunk_id, snippet, score) VALUES (?, ?, ?, ?, ?, ?)`
    )
    for (const s of sources) {
      insertSrc.run(s.id, s.messageId, s.documentId, s.chunkId, s.snippet, s.score)
    }
    deps.onSources?.(messageId, sources)
  }

  return ok({ messageId, content })
}
