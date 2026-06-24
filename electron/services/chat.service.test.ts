import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { openDb } from '../db/index'
import { EMBEDDING_DIM } from '../db/schema'
import { createSession, getMessages, ask, type AskDeps } from './chat.service'
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

  it('replies to add documents when the library is empty', async () => {
    const s = createSession(db)
    if (!isOk(s)) throw new Error('setup')
    const r = await ask(db, { sessionId: s.data.id, question: 'hi' }, baseDeps)
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data.content).toContain('请先添加文档')
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
