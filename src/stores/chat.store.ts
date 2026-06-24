import { create } from 'zustand'
import type { MessageSource } from '@shared/types'

interface ChatState {
  streaming: Record<string, string>
  sources: Record<string, MessageSource[]>
  error: string | null
  appendToken: (messageId: string, delta: string) => void
  setSources: (messageId: string, sources: MessageSource[]) => void
  setError: (message: string) => void
  clear: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  streaming: {},
  sources: {},
  error: null,
  appendToken: (messageId, delta) =>
    set((s) => ({ streaming: { ...s.streaming, [messageId]: (s.streaming[messageId] ?? '') + delta } })),
  setSources: (messageId, sources) => set((s) => ({ sources: { ...s.sources, [messageId]: sources } })),
  setError: (message) => set({ error: message }),
  clear: () => set({ streaming: {}, sources: {}, error: null })
}))
