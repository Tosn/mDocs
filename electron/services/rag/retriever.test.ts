import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openDb } from '../../db/index'
import { EMBEDDING_DIM } from '../../db/schema'
import { retrieve } from './retriever'
import { isOk } from '@shared/types'

let db: Database.Database
beforeEach(() => {
  db = openDb(':memory:')
})
afterEach(() => db.close())

/** 构造 EMBEDDING_DIM 维向量，仅前几维取给定值。 */
function vec(seed: number[]): number[] {
  const v = new Array(EMBEDDING_DIM).fill(0)
  seed.forEach((val, i) => (v[i] = val))
  return v
}

function ensureDoc(d: Database.Database, docId: string): void {
  const now = Date.now()
  d.prepare(
    `INSERT OR IGNORE INTO documents (id, folder_id, name, type, file_path, source_url, content_text, content_hash, size, indexed_at, created_at, updated_at, deleted_at)
     VALUES (?, NULL, ?, 'md', '', NULL, '', 'h', 0, NULL, ?, ?, NULL)`
  ).run(docId, docId, now, now)
}

function addChunk(d: Database.Database, docId: string, id: string, text: string, embedding: number[]): void {
  ensureDoc(d, docId) // 检索现在 JOIN documents，需有对应（未删除）文档行
  d.prepare(
    `INSERT INTO doc_chunks (id, document_id, chunk_index, text, char_start, char_end, token_count)
     VALUES (?, ?, 0, ?, 0, ?, 1)`
  ).run(id, docId, text, text.length)
  d.prepare(`INSERT INTO chunk_vec (chunk_id, embedding) VALUES (?, ?)`).run(id, JSON.stringify(embedding))
}

describe('retrieve', () => {
  it('returns the nearest chunks by cosine similarity', () => {
    addChunk(db, 'doc1', 'c1', 'about cats', vec([1, 0, 0]))
    addChunk(db, 'doc1', 'c2', 'about dogs', vec([0, 1, 0]))

    const r = retrieve(db, vec([0.9, 0.1, 0]), { topK: 1 })
    expect(isOk(r)).toBe(true)
    if (isOk(r)) {
      expect(r.data.length).toBe(1)
      expect(r.data[0].chunkId).toBe('c1')
      expect(r.data[0].documentId).toBe('doc1')
    }
  })

  it('restricts results to documentIds scope', () => {
    addChunk(db, 'doc1', 'c1', 'x', vec([1, 0, 0]))
    addChunk(db, 'doc2', 'c2', 'y', vec([1, 0, 0]))

    const r = retrieve(db, vec([1, 0, 0]), { topK: 5, documentIds: ['doc2'] })
    expect(isOk(r)).toBe(true)
    if (isOk(r)) {
      expect(r.data.length).toBe(1)
      expect(r.data[0].documentId).toBe('doc2')
    }
  })

  it('returns nothing for an empty scope', () => {
    addChunk(db, 'doc1', 'c1', 'x', vec([1, 0, 0]))
    const r = retrieve(db, vec([1, 0, 0]), { documentIds: [] })
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data.length).toBe(0)
  })

  it('returns empty when there are no chunks', () => {
    const r = retrieve(db, vec([1, 0, 0]))
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data.length).toBe(0)
  })

  it('excludes chunks of deleted (trashed) documents', () => {
    addChunk(db, 'live', 'c1', 'x', vec([1, 0, 0]))
    addChunk(db, 'gone', 'c2', 'y', vec([1, 0, 0]))
    db.prepare(`UPDATE documents SET deleted_at = ? WHERE id = 'gone'`).run(Date.now())

    const r = retrieve(db, vec([1, 0, 0]), { topK: 5 })
    expect(isOk(r)).toBe(true)
    if (isOk(r)) {
      expect(r.data.map((c) => c.documentId)).toEqual(['live'])
    }
  })
})
