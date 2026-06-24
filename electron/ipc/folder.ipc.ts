import type Database from 'better-sqlite3'
import { CHANNELS } from '@shared/channels'
import {
  createFolder,
  listFolders,
  buildTree,
  renameFolder,
  deleteFolder
} from '../services/folder.service'

export type IpcLike = {
  handle: (channel: string, listener: (event: unknown, ...args: never[]) => unknown) => void
}

export function registerFolderIpc(ipcMain: IpcLike, db: Database.Database): void {
  ipcMain.handle(CHANNELS.folder.list, (_e, parentId: string | null) => listFolders(db, parentId))
  ipcMain.handle(CHANNELS.folder.tree, () => buildTree(db))
  ipcMain.handle(CHANNELS.folder.create, (_e, input: { name: string; parentId: string | null }) =>
    createFolder(db, input)
  )
  ipcMain.handle(CHANNELS.folder.rename, (_e, id: string, name: string) => renameFolder(db, id, name))
  ipcMain.handle(CHANNELS.folder.delete, (_e, id: string) => deleteFolder(db, id))
}
