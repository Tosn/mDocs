import type Database from 'better-sqlite3'
import { CHANNELS } from '@shared/channels'
import type { IpcLike } from './folder.ipc'
import { listTrash, restoreTrash, purgeTrash } from '../services/trash.service'

export function registerTrashIpc(ipcMain: IpcLike, db: Database.Database): void {
  ipcMain.handle(CHANNELS.trash.list, () => listTrash(db))
  ipcMain.handle(CHANNELS.trash.restore, (_e, id: string) => restoreTrash(db, id))
  ipcMain.handle(CHANNELS.trash.purge, (_e, id: string) => purgeTrash(db, id))
}
