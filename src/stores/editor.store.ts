import { create } from 'zustand'

interface EditorState {
  docId: string | null
  draft: string
  dirty: boolean
  open: (id: string, content: string) => void
  setDraft: (content: string) => void
  markSaved: () => void
  close: () => void
}

export const useEditorStore = create<EditorState>((set) => ({
  docId: null,
  draft: '',
  dirty: false,
  open: (id, content) => set({ docId: id, draft: content, dirty: false }),
  setDraft: (content) => set((s) => ({ draft: content, dirty: content !== s.draft || s.dirty })),
  markSaved: () => set({ dirty: false }),
  close: () => set({ docId: null, draft: '', dirty: false })
}))
