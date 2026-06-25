import type { MDocsApi } from '@electron/preload'

const bridge = (): MDocsApi => (window as unknown as { api: MDocsApi }).api

export const settingsApi = {
  listModels: () => bridge().settings.listModels(),
  getActiveModel: () => bridge().settings.getActiveModel(),
  getActiveEmbedModel: () => bridge().settings.getActiveEmbedModel(),
  switchModel: (id: string) => bridge().settings.switchModel(id),
  selectModel: (input: { provider: string; modelName: string; role?: 'chat' | 'embedding' }) =>
    bridge().settings.selectModel(input),
  saveModel: (input: {
    provider: string
    modelName: string
    baseUrl?: string
    apiKey: string
    role?: 'chat' | 'embedding'
  }) => bridge().settings.saveModel(input),
  testModel: (id: string) => bridge().settings.testModel(id),
  getPrivacyNotice: () => bridge().settings.getPrivacyNotice()
}
