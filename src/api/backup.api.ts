import type { MDocsApi } from '@electron/preload'

const bridge = (): MDocsApi => (window as unknown as { api: MDocsApi }).api

export const backupApi = {
  export: () => bridge().backup.export(),
  import: () => bridge().backup.import()
}
