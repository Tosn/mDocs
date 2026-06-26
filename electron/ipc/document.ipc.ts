import type Database from 'better-sqlite3'
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import { CHANNELS } from '@shared/channels'
import { ok, err, isOk, type Document } from '@shared/types'
import type { IpcLike } from './folder.ipc'
import {
  createDoc,
  updateContent,
  renameDoc,
  moveDoc,
  deleteDoc,
  upload,
  uploadTree,
  importFolder,
  uniqueName
} from '../services/document.service'
import { indexPending } from '../services/rag/indexing.service'
import type { EmbedFn } from '../services/rag/embedder'

interface DocRow {
  id: string
  folder_id: string | null
  name: string
  type: Document['type']
  file_path: string
  source_url: string | null
  content_text: string
  content_hash: string
  size: number
  indexed_at: number | null
  created_at: number
  updated_at: number
  deleted_at: number | null
}

function rowToDoc(r: DocRow): Document {
  return {
    id: r.id,
    folderId: r.folder_id,
    name: r.name,
    type: r.type,
    filePath: r.file_path,
    sourceUrl: r.source_url,
    contentText: r.content_text,
    contentHash: r.content_hash,
    size: r.size,
    indexedAt: r.indexed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at
  }
}

export function registerDocumentIpc(
  ipcMain: IpcLike,
  db: Database.Database,
  ctx: { storageDir?: string; embed?: EmbedFn } = {}
): void {
  // 导入/新建/编辑后，后台为尚未索引的文档建向量索引（失败不阻断，问答时会再提示）。
  const indexLater = () => {
    if (ctx.embed) void indexPending(db, ctx.embed).catch(() => {})
  }

  ipcMain.handle(CHANNELS.document.listByFolder, (_e, folderId: string | null) => {
    const rows = db
      .prepare(`SELECT * FROM documents WHERE deleted_at IS NULL AND folder_id IS ? ORDER BY name`)
      .all(folderId) as DocRow[]
    return ok(rows.map(rowToDoc))
  })

  // 统一树需要：列出全部未删除文档（轻量字段：id/name/type/folderId）。
  ipcMain.handle(CHANNELS.document.listAll, () => {
    const rows = db
      .prepare(
        `SELECT id, name, type, folder_id FROM documents WHERE deleted_at IS NULL ORDER BY name`
      )
      .all() as { id: string; name: string; type: Document['type']; folder_id: string | null }[]
    return ok(rows.map((r) => ({ id: r.id, name: r.name, type: r.type, folderId: r.folder_id })))
  })

  ipcMain.handle(CHANNELS.document.get, (_e, id: string) => {
    const row = db.prepare(`SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL`).get(id) as
      | DocRow
      | undefined
    return row ? ok(rowToDoc(row)) : err('E_NOT_FOUND', '文档不存在')
  })

  ipcMain.handle(CHANNELS.document.pickPaths, async (_e, opts: { directory?: boolean } = {}) => {
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog({
      properties: opts.directory
        ? ['openDirectory', 'multiSelections']
        : ['openFile', 'multiSelections'],
      filters: [{ name: '文档', extensions: ['md', 'markdown', 'txt', 'pdf'] }]
    })
    return ok(result.canceled ? [] : result.filePaths)
  })

  ipcMain.handle(CHANNELS.document.getFileUrl, (_e, id: string) => {
    const row = db.prepare(`SELECT file_path FROM documents WHERE id = ?`).get(id) as
      | { file_path: string }
      | undefined
    if (!row || !row.file_path) return err('E_NOT_FOUND', '该文档无可预览文件')
    return ok(pathToFileURL(row.file_path).href)
  })

  // 返回文件的 base64（渲染层据此造 Blob URL 预览，规避 file:// 跨源 + 启用插件渲染 PDF）。
  ipcMain.handle(CHANNELS.document.getFileBytes, (_e, id: string) => {
    const row = db.prepare(`SELECT file_path FROM documents WHERE id = ?`).get(id) as
      | { file_path: string }
      | undefined
    if (!row || !row.file_path) return err('E_NOT_FOUND', '该文档无可预览文件')
    try {
      return ok(readFileSync(row.file_path).toString('base64'))
    } catch (e) {
      return err('E_READ', `读取文件失败：${(e as Error).message}`)
    }
  })

  ipcMain.handle(
    CHANNELS.document.upload,
    async (_e, input: { paths: string[]; folderId: string | null; onConflict?: never }) => {
      const r = await upload(db, { ...input, storageDir: ctx.storageDir })
      if (isOk(r)) indexLater()
      return r
    }
  )
  ipcMain.handle(
    CHANNELS.document.importFolder,
    async (_e, input: { dirPath: string; folderId: string | null }) => {
      const r = await importFolder(db, { ...input, storageDir: ctx.storageDir })
      if (isOk(r)) indexLater()
      return r
    }
  )
  ipcMain.handle(
    CHANNELS.document.uploadFolder,
    async (_e, input: { dirPath: string; folderId: string | null }) => {
      const r = await uploadTree(db, { ...input, storageDir: ctx.storageDir })
      if (isOk(r)) indexLater()
      return r
    }
  )
  ipcMain.handle(
    CHANNELS.document.createDoc,
    (_e, input: { name: string; folderId: string | null; contentText: string }) => {
      const r = createDoc(db, input)
      if (isOk(r)) indexLater()
      return r
    }
  )
  ipcMain.handle(
    CHANNELS.document.suggestName,
    (_e, input: { name: string; folderId: string | null }) =>
      ok(uniqueName(db, input.folderId, (input.name ?? '').trim()))
  )
  ipcMain.handle(CHANNELS.document.updateContent, (_e, id: string, contentText: string) => {
    const r = updateContent(db, id, contentText)
    if (isOk(r)) indexLater()
    return r
  })
  ipcMain.handle(CHANNELS.document.rename, (_e, id: string, name: string) => renameDoc(db, id, name))
  ipcMain.handle(CHANNELS.document.move, (_e, id: string, folderId: string | null) =>
    moveDoc(db, id, folderId)
  )
  ipcMain.handle(CHANNELS.document.delete, (_e, id: string) => deleteDoc(db, id))
}
