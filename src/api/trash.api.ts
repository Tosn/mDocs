import type { MDocsApi } from '@electron/preload'

const bridge = (): MDocsApi => (window as unknown as { api: MDocsApi }).api

export const trashApi = {
  list: () => bridge().trash.list(),
  restore: (id: string) => bridge().trash.restore(id),
  purge: (id: string) => bridge().trash.purge(id)
}
