import type { MDocsApi } from '@electron/preload'

const bridge = (): MDocsApi => (window as unknown as { api: MDocsApi }).api

export const crawlApi = {
  fromUrl: (input: { url: string; folderId: string | null }) => bridge().crawl.fromUrl(input),
  fromUrlInteractive: (input: { url: string; folderId: string | null; dynamic?: boolean }) =>
    bridge().crawl.fromUrlInteractive(input)
}
