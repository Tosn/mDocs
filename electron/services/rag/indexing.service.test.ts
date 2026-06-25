import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { openDb } from '../../db/index'
import { isOk } from '@shared/types'
import { indexDocument, indexPending, reindexAll, ensureVecDim } from './indexing.service'
import type { EmbedFn } from './embedder'

let db: Database.Database
beforeEach(() => {
  db = openDb(':memory:')
})
afterEach(() => db.close())

function addDoc(d: Database.Database, content: string, indexed = false): string {
  const id = randomUUID()
  const now = Date.now()
  d.prepare(
    `INSERT INTO documents (id, folder_id, name, type, file_path, source_url, content_text, content_hash, size, indexed_at, created_at, updated_at, deleted_at)
     VALUES (?, NULL, ?, 'md', '', NULL, ?, 'h', 1, ?, ?, ?, NULL)`
  ).run(id, 'doc', content, indexed ? now : null, now, now)
  return id
}

// 8 维确定性嵌入，用于断言向量表维度自适应。
const embed8: EmbedFn = async (texts) => texts.map(() => new Array(8).fill(0.1))

describe('indexing.service', () => {
  it('indexDocument chunks, embeds, writes chunk_vec and stamps indexed_at', async () => {
    const id = addDoc(db, 'hello world '.repeat(300)) // 跨多块
    const r = await indexDocument(db, id, embed8)
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data).toBeGreaterThan(1)

    const chunks = db.prepare(`SELECT COUNT(*) AS n FROM doc_chunks WHERE document_id = ?`).get(id) as {
      n: number
    }
    const vecs = db.prepare(`SELECT COUNT(*) AS n FROM chunk_vec`).get() as { n: number }
    expect(chunks.n).toBe(vecs.n)
    expect(chunks.n).toBeGreaterThan(1)

    const doc = db.prepare(`SELECT indexed_at FROM documents WHERE id = ?`).get(id) as {
      indexed_at: number | null
    }
    expect(doc.indexed_at).not.toBeNull()
  })

  it('ensureVecDim rebuilds the vector table at the embedding model dimension', async () => {
    const id = addDoc(db, 'some content to embed')
    await indexDocument(db, id, embed8)
    const dim = db.prepare(`SELECT value FROM settings WHERE key = 'embed_dim'`).get() as {
      value: string
    }
    expect(Number(dim.value)).toBe(8)
  })

  it('re-running ensureVecDim with the same dim is a no-op (keeps chunks)', async () => {
    const id = addDoc(db, 'content')
    await indexDocument(db, id, embed8)
    const before = (db.prepare(`SELECT COUNT(*) AS n FROM doc_chunks`).get() as { n: number }).n
    ensureVecDim(db, 8)
    const after = (db.prepare(`SELECT COUNT(*) AS n FROM doc_chunks`).get() as { n: number }).n
    expect(after).toBe(before)
  })

  it('indexPending only indexes documents that are not yet indexed', async () => {
    addDoc(db, 'first doc content')
    addDoc(db, 'second doc content', true) // 已标记索引 → 跳过
    const r = await indexPending(db, embed8)
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data.indexed).toBe(1)
  })

  it('reindexAll clears and rebuilds all documents', async () => {
    const a = addDoc(db, 'alpha content here')
    const b = addDoc(db, 'beta content here')
    await indexDocument(db, a, embed8)
    await indexDocument(db, b, embed8)

    const r = await reindexAll(db, embed8)
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data.indexed).toBe(2)

    const both = db.prepare(`SELECT COUNT(*) AS n FROM documents WHERE indexed_at IS NOT NULL`).get() as {
      n: number
    }
    expect(both.n).toBe(2)
  })

  it('propagates embedding failures', async () => {
    const id = addDoc(db, 'content')
    const failing: EmbedFn = async () => {
      throw new Error('boom')
    }
    const r = await indexDocument(db, id, failing)
    expect(isOk(r)).toBe(false)
    const doc = db.prepare(`SELECT indexed_at FROM documents WHERE id = ?`).get(id) as {
      indexed_at: number | null
    }
    expect(doc.indexed_at).toBeNull() // 失败不标记，便于重试
  })
})
