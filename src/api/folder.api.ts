import type { MDocsApi } from '@electron/preload'

const bridge = (): MDocsApi => (window as unknown as { api: MDocsApi }).api

export const folderApi = {
  list: (parentId: string | null) => bridge().folder.list(parentId),
  tree: () => bridge().folder.tree(),
  create: (input: { name: string; parentId: string | null }) => bridge().folder.create(input),
  rename: (id: string, name: string) => bridge().folder.rename(id, name),
  delete: (id: string) => bridge().folder.delete(id)
}
