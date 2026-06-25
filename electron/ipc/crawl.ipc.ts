import type Database from 'better-sqlite3'
import { CHANNELS } from '@shared/channels'
import { isOk } from '@shared/types'
import type { IpcLike } from './folder.ipc'
import { fromUrl } from '../services/crawl.service'
import { fromUrlInteractive, type InteractiveDeps } from '../services/crawl-login.service'
import { indexPending } from '../services/rag/indexing.service'
import type { EmbedFn } from '../services/rag/embedder'

export function registerCrawlIpc(
  ipcMain: IpcLike,
  db: Database.Database,
  ctx: { storageDir?: string; interactiveDeps?: InteractiveDeps; embed?: EmbedFn } = {}
): void {
  const indexLater = () => {
    if (ctx.embed) void indexPending(db, ctx.embed).catch(() => {})
  }

  ipcMain.handle(
    CHANNELS.crawl.fromUrl,
    async (_e, input: { url: string; folderId: string | null }) => {
      const r = await fromUrl(db, { ...input, storageDir: ctx.storageDir })
      if (isOk(r)) indexLater()
      return r
    }
  )
  ipcMain.handle(
    CHANNELS.crawl.fromUrlInteractive,
    async (_e, input: { url: string; folderId: string | null }) => {
      const r = await fromUrlInteractive(db, { ...input, storageDir: ctx.storageDir }, ctx.interactiveDeps)
      if (isOk(r)) indexLater()
      return r
    }
  )
}
