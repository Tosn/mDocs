import type Database from 'better-sqlite3'
import { ok, type Result } from '@shared/types'

export interface RetrievedChunk {
  chunkId: string
  documentId: string
  text: string
  charStart: number
  charEnd: number
  score: number
}

interface ChunkRow {
  id: string
  document_id: string
  text: string
  char_start: number
  char_end: number
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/**
 * 向量检索：在 chunk_vec 上按余弦相似度取 TopK。
 * documentIds 提供时仅在该范围内检索（spec E6）：undefined=全库，[]=空范围（无结果）。
 */
export function retrieve(
  db: Database.Database,
  queryVector: number[],
  opts?: { topK?: number; documentIds?: string[] }
): Result<RetrievedChunk[]> {
  const topK = opts?.topK ?? 5
  const ids = opts?.documentIds

  // 只检索未删除文档的块：回收站（软删）/已彻底删除的文档不参与检索，也不出现在来源。
  let chunkRows: ChunkRow[]
  if (ids !== undefined) {
    if (ids.length === 0) return ok([])
    const ph = ids.map(() => '?').join(',')
    chunkRows = db
      .prepare(
        `SELECT c.id, c.document_id, c.text, c.char_start, c.char_end
         FROM doc_chunks c JOIN documents d ON d.id = c.document_id
         WHERE d.deleted_at IS NULL AND c.document_id IN (${ph})`
      )
      .all(...ids) as ChunkRow[]
  } else {
    chunkRows = db
      .prepare(
        `SELECT c.id, c.document_id, c.text, c.char_start, c.char_end
         FROM doc_chunks c JOIN documents d ON d.id = c.document_id
         WHERE d.deleted_at IS NULL`
      )
      .all() as ChunkRow[]
  }

  const getVec = db.prepare(`SELECT vec_to_json(embedding) AS v FROM chunk_vec WHERE chunk_id = ?`)
  const scored: RetrievedChunk[] = []
  for (const r of chunkRows) {
    const row = getVec.get(r.id) as { v: string } | undefined
    if (!row) continue
    const vector = JSON.parse(row.v) as number[]
    scored.push({
      chunkId: r.id,
      documentId: r.document_id,
      text: r.text,
      charStart: r.char_start,
      charEnd: r.char_end,
      score: cosine(queryVector, vector)
    })
  }

  scored.sort((a, b) => b.score - a.score)
  return ok(scored.slice(0, topK))
}
