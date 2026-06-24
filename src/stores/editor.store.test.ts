import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from './editor.store'

beforeEach(() => useEditorStore.setState({ docId: null, draft: '', dirty: false }))

describe('editor.store', () => {
  it('open sets content and is not dirty', () => {
    useEditorStore.getState().open('d1', 'hi')
    const s = useEditorStore.getState()
    expect(s.docId).toBe('d1')
    expect(s.draft).toBe('hi')
    expect(s.dirty).toBe(false)
  })

  it('setDraft marks dirty when content changes', () => {
    useEditorStore.getState().open('d1', 'hi')
    useEditorStore.getState().setDraft('hello')
    expect(useEditorStore.getState().dirty).toBe(true)
  })

  it('markSaved clears dirty', () => {
    useEditorStore.getState().open('d1', 'hi')
    useEditorStore.getState().setDraft('x')
    useEditorStore.getState().markSaved()
    expect(useEditorStore.getState().dirty).toBe(false)
  })

  it('close resets state', () => {
    useEditorStore.getState().open('d1', 'hi')
    useEditorStore.getState().close()
    expect(useEditorStore.getState().docId).toBeNull()
  })
})
