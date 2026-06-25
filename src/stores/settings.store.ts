import { create } from 'zustand'
import type { ModelInfo } from '@electron/services/llm/registry'

interface SettingsState {
  models: ModelInfo[]
  currentModelId: string | null
  currentConfigId: string | null
  needKey: boolean
  maskedKey: string | null
  // 嵌入模型（与对话模型独立配置）
  currentEmbedId: string | null
  embedConfigId: string | null
  embedNeedKey: boolean
  embedMaskedKey: string | null
  setModels: (models: ModelInfo[]) => void
  setActive: (id: string | null) => void
  setConfigId: (id: string | null) => void
  setNeedKey: (needKey: boolean, maskedKey?: string | null) => void
  setActiveEmbed: (id: string | null) => void
  setEmbedConfigId: (id: string | null) => void
  setEmbedNeedKey: (needKey: boolean, maskedKey?: string | null) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  models: [],
  currentModelId: null,
  currentConfigId: null,
  needKey: false,
  maskedKey: null,
  currentEmbedId: null,
  embedConfigId: null,
  embedNeedKey: false,
  embedMaskedKey: null,
  setModels: (models) => set({ models }),
  setActive: (id) => set({ currentModelId: id }),
  setConfigId: (id) => set({ currentConfigId: id }),
  setNeedKey: (needKey, maskedKey = null) => set({ needKey, maskedKey }),
  setActiveEmbed: (id) => set({ currentEmbedId: id }),
  setEmbedConfigId: (id) => set({ embedConfigId: id }),
  setEmbedNeedKey: (needKey, maskedKey = null) =>
    set({ embedNeedKey: needKey, embedMaskedKey: maskedKey })
}))
