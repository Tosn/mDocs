import { describe, it, expect, beforeEach } from 'vitest'
import { useTreeStore } from './tree.store'

beforeEach(() => useTreeStore.setState({ expanded: {}, selectedId: null }))

describe('tree.store', () => {
  it('toggle expands then collapses a folder', () => {
    useTreeStore.getState().toggle('a')
    expect(useTreeStore.getState().isExpanded('a')).toBe(true)
    useTreeStore.getState().toggle('a')
    expect(useTreeStore.getState().isExpanded('a')).toBe(false)
  })

  it('select sets the selected id', () => {
    useTreeStore.getState().select('x')
    expect(useTreeStore.getState().selectedId).toBe('x')
  })
})
