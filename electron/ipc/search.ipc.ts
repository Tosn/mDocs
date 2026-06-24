import type Database from 'better-sqlite3'
import { CHANNELS } from '@shared/channels'
import type { IpcLike } from './folder.ipc'
import { keywordSearch } from '../services/search.service'

export function registerSearchIpc(ipcMain: IpcLike, db: Database.Database): void {
  ipcMain.handle(CHANNELS.search.keyword, (_e, input: { query: string; limit?: number }) =>
    keywordSearch(db, input)
  )
}
