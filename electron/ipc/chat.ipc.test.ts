import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { openDb } from '../db/index'
import { EMBEDDING_DIM } from '../db/schema'
import { CHANNELS, EVENTS } from '@shared/channels'
import { createSession } from '../services/chat.service'
import { registerChatIpc } from './chat.ipc'
import { isOk, type MessageSource } from '@shared/types'

function fakeIpc() {
  const handlers = new Map<string, (e: unknown, ...a: unknown[]) => unknown>()
  return {
    handle: (c: string, fn: (e: unknown, ...a: unknown[]) => unknown) => handlers.set(c, fn),
    has: (c: string) => handlers.has(c),
    invoke: (c: string, event: unknown, ...args: unknown[]) => handlers.get(c)!(event, ...args)
  }
}

function vec(seed: number[]): number[] {
  const v = new Array(EMBEDDING_DIM).fill(0)
  seed.forEach((val, i) => (v[i] = val))
  return v
}

let db: Database.Database
let ipc: ReturnType<typeof fakeIpc>
beforeEach(() => {
  db = openDb(':memory:')
  ipc = fakeIpc()
})
afterEach(() => db.close())

describe('chat.ipc', () => {
  it('registers all chat channels', () => {
    registerChatIpc(ipc as never, { db, makeAskDeps: () => ({ embedQuery: async () => [], streamChat: async function* () {} }) })
    for (const c of Object.values(CHANNELS.chat)) expect(ipc.has(c)).toBe(true)
  })

  it('ask forwards tokens and sources to the renderer and returns messageId', async () => {
    const s = createSession(db)
    if (!isOk(s)) throw new Error('setup')
    const docId = randomUUID()
    const now = Date.now()
    db.prepare(
      `INSERT INTO documents (id, folder_id, name, type, file_path, source_url, content_text, content_hash, size, indexed_at, created_at, updated_at, deleted_at)
       VALUES (?, NULL, 'd', 'md', '', NULL, 'c', 'h', 1, ?, ?, ?, NULL)`
    ).run(docId, now, now, now)
    const chunkId = randomUUID()
    db.prepare(
      `INSERT INTO doc_chunks (id, document_id, chunk_index, text, char_start, char_end, token_count) VALUES (?, ?, 0, 'fact', 0, 4, 1)`
    ).run(chunkId, docId)
    db.prepare(`INSERT INTO chunk_vec (chunk_id, embedding) VALUES (?, ?)`).run(
      chunkId,
      JSON.stringify(vec([1, 0, 0]))
    )

    const sent: { ch: string; payload: unknown }[] = []
    const event = { sender: { send: (ch: string, payload: unknown) => sent.push({ ch, payload }) } }

    registerChatIpc(ipc as never, {
      db,
      makeAskDeps: (ev: typeof event) => ({
        embedQuery: async () => vec([1, 0, 0]),
        streamChat: async function* () {
          yield 'Hi'
        },
        onToken: (messageId: string, delta: string) =>
          ev.sender.send(EVENTS.chatToken, { messageId, delta }),
        onSources: (messageId: string, sources: MessageSource[]) =>
          ev.sender.send(EVENTS.chatSources, { messageId, sources })
      })
    })

    const r = (await ipc.invoke(CHANNELS.chat.ask, event, {
      sessionId: s.data.id,
      question: 'what?'
    })) as { ok: boolean; data?: { messageId: string } }

    expect(r.ok).toBe(true)
    expect(typeof r.data?.messageId).toBe('string')
    expect(sent.some((m) => m.ch === EVENTS.chatToken)).toBe(true)
    expect(sent.some((m) => m.ch === EVENTS.chatSources)).toBe(true)
  })
})
