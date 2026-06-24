import type { MDocsApi } from '@electron/preload'

const bridge = (): MDocsApi => (window as unknown as { api: MDocsApi }).api

export const searchApi = {
  keyword: (input: { query: string; limit?: number }) => bridge().search.keyword(input)
}
