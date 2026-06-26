import type Database from 'better-sqlite3'
import { readFileSync, writeFileSync } from 'node:fs'
import { CHANNELS } from '@shared/channels'
import { ok, err, isOk } from '@shared/types'
import type { IpcLike } from './folder.ipc'
import { exportLibrary, importLibrary, type ExportBundle } from '../services/backup.service'
import { indexPending } from '../services/rag/indexing.service'
import type { EmbedFn } from '../services/rag/embedder'

export function registerBackupIpc(
  ipcMain: IpcLike,
  db: Database.Database,
  ctx: { storageDir?: string; embed?: EmbedFn } = {}
): void {
  // 导出整库为单个 JSON 文件（含 PDF base64），用于换电脑迁移。
  ipcMain.handle(CHANNELS.backup.export, async () => {
    const r = exportLibrary(db)
    if (!isOk(r)) return r
    const { dialog } = await import('electron')
    const res = await dialog.showSaveDialog({
      defaultPath: `mdocs-export-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'mDocs 导出', extensions: ['json'] }]
    })
    if (res.canceled || !res.filePath) return ok({ canceled: true })
    try {
      writeFileSync(res.filePath, JSON.stringify(r.data))
    } catch (e) {
      return err('E_WRITE', `写入失败：${(e as Error).message}`)
    }
    return ok({
      canceled: false,
      path: res.filePath,
      folders: r.data.folders.length,
      documents: r.data.documents.length
    })
  })

  // 从 JSON 文件导入文档库；导入后后台为新文档建索引。
  ipcMain.handle(CHANNELS.backup.import, async () => {
    const { dialog } = await import('electron')
    const res = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'mDocs 导出', extensions: ['json'] }]
    })
    if (res.canceled || res.filePaths.length === 0) return ok({ canceled: true })
    let bundle: ExportBundle
    try {
      bundle = JSON.parse(readFileSync(res.filePaths[0], 'utf-8')) as ExportBundle
    } catch {
      return err('E_INVALID', '无法解析导入文件（不是有效的 JSON）')
    }
    const r = importLibrary(db, bundle, ctx.storageDir)
    if (!isOk(r)) return r
    if (ctx.embed) void indexPending(db, ctx.embed).catch(() => {})
    return ok({ canceled: false, ...r.data })
  })
}
