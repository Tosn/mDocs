import type Database from 'better-sqlite3'

/** @问答范围（spec E6）：指定文件与/或文件夹。 */
export interface ChatScope {
  documentIds?: string[]
  folderIds?: string[]
}

/**
 * 把 @范围解析为文档 id 列表。
 * - 返回 null：未指定范围 → 全库检索。
 * - 返回 string[]：限定到这些文档（已剔除被删除/回收站的文档）。
 * - 返回 []：指定了范围但其中无有效文档 → 空范围。
 * folderIds 递归展开为其下所有（含子目录）的非删除文档。
 */
export function resolveScope(db: Database.Database, scope?: ChatScope): string[] | null {
  const hasDocs = !!scope?.documentIds?.length
  const hasFolders = !!scope?.folderIds?.length
  if (!scope || (!hasDocs && !hasFolders)) return null

  const result = new Set<string>()

  // 显式文档：仅保留未删除的。
  if (hasDocs) {
    const ph = scope!.documentIds!.map(() => '?').join(',')
    const rows = db
      .prepare(`SELECT id FROM documents WHERE deleted_at IS NULL AND id IN (${ph})`)
      .all(...scope!.documentIds!) as { id: string }[]
    for (const r of rows) result.add(r.id)
  }

  // 文件夹：递归收集子目录，再取其下未删除文档。
  if (hasFolders) {
    const allFolders: string[] = []
    const seen = new Set<string>()
    const queue = [...scope!.folderIds!]
    for (const f of queue) seen.add(f)
    const childStmt = db.prepare(`SELECT id FROM folders WHERE parent_id = ? AND deleted_at IS NULL`)
    while (queue.length) {
      const cur = queue.shift()!
      allFolders.push(cur)
      for (const r of childStmt.all(cur) as { id: string }[]) {
        if (!seen.has(r.id)) {
          seen.add(r.id)
          queue.push(r.id)
        }
      }
    }
    const ph = allFolders.map(() => '?').join(',')
    const rows = db
      .prepare(`SELECT id FROM documents WHERE deleted_at IS NULL AND folder_id IN (${ph})`)
      .all(...allFolders) as { id: string }[]
    for (const r of rows) result.add(r.id)
  }

  return [...result]
}
