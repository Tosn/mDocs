import { create } from 'zustand'
import type { ModelInfo } from '@electron/services/llm/registry'

interface SettingsState {
  models: ModelInfo[]
  currentModelId: string | null
  needKey: boolean
  maskedKey: string | null
  setModels: (models: ModelInfo[]) => void
  setActive: (id: string | null) => void
  setNeedKey: (needKey: boolean, maskedKey?: string | null) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  models: [],
  currentModelId: null,
  needKey: false,
  maskedKey: null,
  setModels: (models) => set({ models }),
  setActive: (id) => set({ currentModelId: id }),
  setNeedKey: (needKey, maskedKey = null) => set({ needKey, maskedKey })
}))
