import type Database from 'better-sqlite3'
import { ok, type Result, type SearchHit } from '@shared/types'

interface HitRow {
  documentId: string
  name: string
  snippet: string
  contentText: string
}

/**
 * 关键词搜索（FTS5，离线）。返回文件名/内容命中的结果，含高亮片段与命中位置。
 * 空查询返回空数组；非法 MATCH 语法（用户输入特殊字符）降级为空结果，不抛错。
 */
export function keywordSearch(
  db: Database.Database,
  input: { query: string; limit?: number }
): Result<SearchHit[]> {
  const raw = (input.query ?? '').trim()
  if (!raw) return ok([])

  // 把用户输入拆词并各自加引号，避免 FTS5 语法错误。
  const tokens = raw
    .split(/\s+/)
    .map((t) => t.replace(/"/g, '').trim())
    .filter(Boolean)
  if (tokens.length === 0) return ok([])
  const match = tokens.map((t) => `"${t}"`).join(' ')
  const limit = input.limit ?? 50

  let rows: HitRow[]
  try {
    rows = db
      .prepare(
        `SELECT f.document_id AS documentId,
                d.name AS name,
                snippet(documents_fts, 2, '[', ']', '…', 10) AS snippet,
                f.content_text AS contentText
         FROM documents_fts f
         JOIN documents d ON d.id = f.document_id
         WHERE documents_fts MATCH ? AND d.deleted_at IS NULL
         ORDER BY rank
         LIMIT ?`
      )
      .all(match, limit) as HitRow[]
  } catch {
    return ok([])
  }

  const firstTerm = tokens[0].toLowerCase()
  const hits: SearchHit[] = rows.map((r) => ({
    documentId: r.documentId,
    name: r.name,
    snippet: r.snippet,
    charStart: Math.max(0, r.contentText.toLowerCase().indexOf(firstTerm))
  }))
  return ok(hits)
}
