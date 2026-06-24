import { create } from 'zustand'

interface TreeState {
  expanded: Record<string, boolean>
  selectedId: string | null
  toggle: (id: string) => void
  select: (id: string | null) => void
  isExpanded: (id: string) => boolean
}

export const useTreeStore = create<TreeState>((set, get) => ({
  expanded: {},
  selectedId: null,
  toggle: (id) => set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } })),
  select: (id) => set({ selectedId: id }),
  isExpanded: (id) => !!get().expanded[id]
}))
