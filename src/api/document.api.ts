import type { MDocsApi } from '@electron/preload'

const bridge = (): MDocsApi => (window as unknown as { api: MDocsApi }).api

export const documentApi = {
  listByFolder: (folderId: string | null) => bridge().document.listByFolder(folderId),
  get: (id: string) => bridge().document.get(id),
  getFileUrl: (id: string) => bridge().document.getFileUrl(id),
  pickPaths: (opts: { directory?: boolean }) => bridge().document.pickPaths(opts),
  upload: (input: { paths: string[]; folderId: string | null; onConflict?: string }) =>
    bridge().document.upload(input),
  importFolder: (input: { dirPath: string; folderId: string | null }) =>
    bridge().document.importFolder(input),
  createDoc: (input: { name: string; folderId: string | null; contentText: string }) =>
    bridge().document.createDoc(input),
  updateContent: (id: string, contentText: string) =>
    bridge().document.updateContent(id, contentText),
  rename: (id: string, name: string) => bridge().document.rename(id, name),
  delete: (id: string) => bridge().document.delete(id)
}
