import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { ok, err, isOk, type Result } from '@shared/types'
import { vecSql } from '../../db/schema'
import { chunkText } from './chunker'
import { embedTexts, type EmbedFn } from './embedder'

// 当前向量维度记于 settings，便于换嵌入模型时检测是否需要重建向量表。
const EMBED_DIM_SETTING = 'embed_dim'

function getEmbedDim(db: Database.Database): number | null {
  const r = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(EMBED_DIM_SETTING) as
    | { value: string }
    | undefined
  return r ? Number(r.value) : null
}

function setEmbedDim(db: Database.Database, dim: number): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(EMBED_DIM_SETTING, String(dim))
}

/**
 * 确保 chunk_vec 的维度与嵌入模型一致。维度变化时旧向量全部失效：
 * 清空块表、按新维度重建向量表，并把所有文档标记为待重建索引。
 */
export function ensureVecDim(db: Database.Database, dim: number): void {
  if (getEmbedDim(db) === dim) return
  db.exec(`DROP TABLE IF EXISTS chunk_vec;`)
  db.exec(`DELETE FROM doc_chunks;`)
  db.exec(vecSql(dim))
  db.prepare(`UPDATE documents SET indexed_at = NULL`).run()
  setEmbedDim(db, dim)
}

/** 为单个文档建立索引（分块 → 嵌入 → 写 doc_chunks + chunk_vec），幂等覆盖旧块。 */
export async function indexDocument(
  db: Database.Database,
  docId: string,
  embed: EmbedFn
): Promise<Result<number>> {
  const row = db
    .prepare(`SELECT content_text FROM documents WHERE id = ? AND deleted_at IS NULL`)
    .get(docId) as { content_text: string } | undefined
  if (!row) return err('E_NOT_FOUND', '文档不存在')

  const chunks = chunkText(row.content_text ?? '')
  if (chunks.length === 0) {
    db.prepare(`UPDATE documents SET indexed_at = ? WHERE id = ?`).run(Date.now(), docId)
    return ok(0)
  }

  const vres = await embedTexts(
    chunks.map((c) => c.text),
    embed
  )
  if (!isOk(vres)) return err(vres.error.code, vres.error.message)
  const vectors = vres.data
  if (vectors.length === 0 || vectors[0].length === 0) return err('E_EMBED', '嵌入返回为空')

  ensureVecDim(db, vectors[0].length)

  const now = Date.now()
  const tx = db.transaction(() => {
    const old = db.prepare(`SELECT id FROM doc_chunks WHERE document_id = ?`).all(docId) as {
      id: string
    }[]
    const delVec = db.prepare(`DELETE FROM chunk_vec WHERE chunk_id = ?`)
    for (const o of old) delVec.run(o.id)
    db.prepare(`DELETE FROM doc_chunks WHERE document_id = ?`).run(docId)

    const insChunk = db.prepare(
      `INSERT INTO doc_chunks (id, document_id, chunk_index, text, char_start, char_end, token_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    const insVec = db.prepare(`INSERT INTO chunk_vec (chunk_id, embedding) VALUES (?, ?)`)
    chunks.forEach((c, i) => {
      const cid = randomUUID()
      insChunk.run(cid, docId, c.chunkIndex, c.text, c.charStart, c.charEnd, c.tokenCount)
      insVec.run(cid, JSON.stringify(vectors[i]))
    })
    db.prepare(`UPDATE documents SET indexed_at = ? WHERE id = ?`).run(now, docId)
  })
  tx()
  return ok(chunks.length)
}

/** 索引所有尚未索引（indexed_at IS NULL）的文档。导入后调用，按需嵌入。 */
export async function indexPending(
  db: Database.Database,
  embed: EmbedFn,
  onProgress?: (done: number, total: number) => void
): Promise<Result<{ indexed: number }>> {
  const rows = db
    .prepare(`SELECT id FROM documents WHERE deleted_at IS NULL AND indexed_at IS NULL`)
    .all() as { id: string }[]
  let indexed = 0
  for (let i = 0; i < rows.length; i++) {
    const r = await indexDocument(db, rows[i].id, embed)
    if (!isOk(r)) return err(r.error.code, r.error.message)
    indexed += 1
    onProgress?.(i + 1, rows.length)
  }
  return ok({ indexed })
}

/** 全量重建索引（换嵌入模型/维度变化后用）：清空后重嵌入所有文档。 */
export async function reindexAll(
  db: Database.Database,
  embed: EmbedFn,
  onProgress?: (done: number, total: number) => void
): Promise<Result<{ indexed: number }>> {
  db.exec(`DELETE FROM chunk_vec;`)
  db.exec(`DELETE FROM doc_chunks;`)
  db.prepare(`UPDATE documents SET indexed_at = NULL`).run()
  return indexPending(db, embed, onProgress)
}
