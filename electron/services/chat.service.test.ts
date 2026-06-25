import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { openDb } from '../db/index'
import { EMBEDDING_DIM } from '../db/schema'
import {
  createSession,
  listSessions,
  deleteSession,
  getMessages,
  getSources,
  ask,
  type AskDeps
} from './chat.service'
import { isOk } from '@shared/types'

let db: Database.Database
beforeEach(() => {
  db = openDb(':memory:')
})
afterEach(() => db.close())

function vec(seed: number[]): number[] {
  const v = new Array(EMBEDDING_DIM).fill(0)
  seed.forEach((val, i) => (v[i] = val))
  return v
}

function addDocRow(d: Database.Database, id: string, name: string): void {
  const now = Date.now()
  d.prepare(
    `INSERT INTO documents (id, folder_id, name, type, file_path, source_url, content_text, content_hash, size, indexed_at, created_at, updated_at, deleted_at)
     VALUES (?, NULL, ?, 'md', '', NULL, ?, 'h', 1, ?, ?, ?, NULL)`
  ).run(id, name, 'content', now, now, now)
}

function addChunk(d: Database.Database, docId: string, id: string, text: string, embedding: number[]): void {
  d.prepare(
    `INSERT INTO doc_chunks (id, document_id, chunk_index, text, char_start, char_end, token_count)
     VALUES (?, ?, 0, ?, 0, ?, 1)`
  ).run(id, docId, text, text.length)
  d.prepare(`INSERT INTO chunk_vec (chunk_id, embedding) VALUES (?, ?)`).run(id, JSON.stringify(embedding))
}

const okStream: AskDeps['streamChat'] = async function* () {
  yield 'Ans'
  yield 'wer'
}
const baseDeps: AskDeps = {
  embedQuery: async () => vec([1, 0, 0]),
  streamChat: okStream
}

describe('chat.service', () => {
  it('creates a session and reads its (empty) messages', () => {
    const s = createSession(db)
    expect(isOk(s)).toBe(true)
    if (isOk(s)) {
      const m = getMessages(db, s.data.id)
      if (isOk(m)) expect(m.data.length).toBe(0)
    }
  })

  it('listSessions hides empty sessions and deleteSession removes a session', async () => {
    const empty = createSession(db)
    const used = createSession(db)
    if (!isOk(empty) || !isOk(used)) throw new Error('setup')
    await ask(db, { sessionId: used.data.id, question: '你好' }, baseDeps)

    const list1 = listSessions(db)
    if (!isOk(list1)) throw new Error('list')
    expect(list1.data.map((s) => s.id)).toEqual([used.data.id]) // 空会话被隐藏

    const del = deleteSession(db, used.data.id)
    expect(isOk(del)).toBe(true)
    const list2 = listSessions(db)
    if (isOk(list2)) expect(list2.data.length).toBe(0)
    const msgs = db.prepare(`SELECT COUNT(*) AS n FROM chat_messages WHERE session_id = ?`).get(used.data.id) as {
      n: number
    }
    expect(msgs.n).toBe(0)
  })

  it('sets the session title from the first question', async () => {
    const s = createSession(db)
    if (!isOk(s)) throw new Error('setup')
    await ask(db, { sessionId: s.data.id, question: '如何使用 claude 进行 SDD 开发' }, baseDeps)
    const row = db.prepare(`SELECT title FROM chat_sessions WHERE id = ?`).get(s.data.id) as {
      title: string
    }
    expect(row.title).toBe('如何使用 claude 进行 SDD 开发')
    // 第二条提问不再改标题
    await ask(db, { sessionId: s.data.id, question: '另一个问题' }, baseDeps)
    const row2 = db.prepare(`SELECT title FROM chat_sessions WHERE id = ?`).get(s.data.id) as {
      title: string
    }
    expect(row2.title).toBe('如何使用 claude 进行 SDD 开发')
  })

  it('replies to add documents when the library is empty', async () => {
    const s = createSession(db)
    if (!isOk(s)) throw new Error('setup')
    const r = await ask(db, { sessionId: s.data.id, question: 'hi' }, baseDeps)
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data.content).toContain('请先添加文档')
  })

  it('emits the early reply via onToken so the renderer can show it', async () => {
    const s = createSession(db)
    if (!isOk(s)) throw new Error('setup')
    const tokens: string[] = []
    const r = await ask(
      db,
      { sessionId: s.data.id, question: 'hi' },
      { ...baseDeps, onToken: (_id, delta) => tokens.push(delta) }
    )
    expect(isOk(r)).toBe(true)
    expect(tokens.join('')).toContain('请先添加文档')
  })

  it('runs the full RAG loop: streams answer and persists sources', async () => {
    const s = createSession(db)
    if (!isOk(s)) throw new Error('setup')
    const docId = randomUUID()
    addDocRow(db, docId, 'doc')
    addChunk(db, docId, randomUUID(), 'relevant fact', vec([1, 0, 0]))

    const tokens: string[] = []
    let sourcesEmitted = 0
    const r = await ask(
      db,
      { sessionId: s.data.id, question: 'what?' },
      {
        ...baseDeps,
        onToken: (_id, delta) => tokens.push(delta),
        onSources: (_id, srcs) => (sourcesEmitted = srcs.length)
      }
    )
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data.content).toBe('Answer')
    expect(tokens.join('')).toBe('Answer')
    expect(sourcesEmitted).toBeGreaterThan(0)

    const persistedSources = db.prepare(`SELECT COUNT(*) AS n FROM message_sources`).get() as { n: number }
    expect(persistedSources.n).toBeGreaterThan(0)

    const msgs = getMessages(db, s.data.id)
    if (isOk(msgs)) {
      expect(msgs.data.some((m) => m.role === 'assistant' && m.content === 'Answer')).toBe(true)
      expect(msgs.data.some((m) => m.role === 'user')).toBe(true)
    }
  })

  it('falls back to a placeholder when the model streams no tokens', async () => {
    const s = createSession(db)
    if (!isOk(s)) throw new Error('setup')
    const docId = randomUUID()
    addDocRow(db, docId, 'doc')
    addChunk(db, docId, randomUUID(), 'relevant fact', vec([1, 0, 0]))

    const tokens: string[] = []
    const emptyStream: AskDeps['streamChat'] = async function* () {
      /* 模型未产出任何 token */
    }
    const r = await ask(
      db,
      { sessionId: s.data.id, question: 'q' },
      { ...baseDeps, streamChat: emptyStream, onToken: (_id, delta) => tokens.push(delta) }
    )
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data.content).toContain('未返回内容')
    expect(tokens.join('')).toContain('未返回内容')
  })

  it('getSources returns persisted sources with the document name', async () => {
    const s = createSession(db)
    if (!isOk(s)) throw new Error('setup')
    const docId = randomUUID()
    addDocRow(db, docId, 'my-doc')
    addChunk(db, docId, randomUUID(), 'relevant fact', vec([1, 0, 0]))
    await ask(db, { sessionId: s.data.id, question: 'what?' }, baseDeps)

    const r = getSources(db, s.data.id)
    expect(isOk(r)).toBe(true)
    if (isOk(r)) {
      expect(r.data.length).toBeGreaterThan(0)
      expect(r.data[0].documentName).toBe('my-doc')
    }
  })

  it('does not surface sources when the model answers not-found', async () => {
    const s = createSession(db)
    if (!isOk(s)) throw new Error('setup')
    const docId = randomUUID()
    addDocRow(db, docId, 'doc')
    addChunk(db, docId, randomUUID(), 'unrelated fact', vec([1, 0, 0]))

    let sourcesEmitted = -1
    const notFoundStream: AskDeps['streamChat'] = async function* () {
      yield '未在文档中找到相关内容'
    }
    const r = await ask(
      db,
      { sessionId: s.data.id, question: 'halou' },
      { ...baseDeps, streamChat: notFoundStream, onSources: (_id, srcs) => (sourcesEmitted = srcs.length) }
    )
    expect(isOk(r)).toBe(true)
    expect(sourcesEmitted).toBe(-1) // onSources 未被调用
    const persisted = db.prepare(`SELECT COUNT(*) AS n FROM message_sources`).get() as { n: number }
    expect(persisted.n).toBe(0)
  })

  it('answers not-found when nothing is retrieved', async () => {
    const s = createSession(db)
    if (!isOk(s)) throw new Error('setup')
    addDocRow(db, randomUUID(), 'doc-without-chunks')
    const r = await ask(db, { sessionId: s.data.id, question: 'q' }, baseDeps)
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data.content).toContain('未在文档中找到相关内容')
  })

  it('reports empty scope when @scope resolves to nothing', async () => {
    const s = createSession(db)
    if (!isOk(s)) throw new Error('setup')
    const docId = randomUUID()
    addDocRow(db, docId, 'doc')
    addChunk(db, docId, randomUUID(), 'fact', vec([1, 0, 0]))

    const r = await ask(
      db,
      { sessionId: s.data.id, question: 'q', scope: { folderIds: ['nonexistent'] } },
      baseDeps
    )
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data.content).toContain('范围内没有可用文档')
  })
})
