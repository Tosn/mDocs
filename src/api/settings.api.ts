import type { MDocsApi } from '@electron/preload'

const bridge = (): MDocsApi => (window as unknown as { api: MDocsApi }).api

export const settingsApi = {
  listModels: () => bridge().settings.listModels(),
  getActiveModel: () => bridge().settings.getActiveModel(),
  switchModel: (id: string) => bridge().settings.switchModel(id),
  saveModel: (input: { provider: string; modelName: string; baseUrl?: string; apiKey: string }) =>
    bridge().settings.saveModel(input),
  testModel: (id: string) => bridge().settings.testModel(id),
  getPrivacyNotice: () => bridge().settings.getPrivacyNotice()
}
