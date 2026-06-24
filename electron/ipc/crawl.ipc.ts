import type Database from 'better-sqlite3'
import { CHANNELS } from '@shared/channels'
import type { IpcLike } from './folder.ipc'
import { fromUrl } from '../services/crawl.service'
import { fromUrlInteractive, type InteractiveDeps } from '../services/crawl-login.service'

export function registerCrawlIpc(
  ipcMain: IpcLike,
  db: Database.Database,
  ctx: { storageDir?: string; interactiveDeps?: InteractiveDeps } = {}
): void {
  ipcMain.handle(CHANNELS.crawl.fromUrl, (_e, input: { url: string; folderId: string | null }) =>
    fromUrl(db, { ...input, storageDir: ctx.storageDir })
  )
  ipcMain.handle(
    CHANNELS.crawl.fromUrlInteractive,
    (_e, input: { url: string; folderId: string | null }) =>
      fromUrlInteractive(db, { ...input, storageDir: ctx.storageDir }, ctx.interactiveDeps)
  )
}
