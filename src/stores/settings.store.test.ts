import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore } from './settings.store'

beforeEach(() =>
  useSettingsStore.setState({ models: [], currentModelId: null, needKey: false, maskedKey: null })
)

describe('settings.store', () => {
  it('setActive sets the current model', () => {
    useSettingsStore.getState().setActive('openai:gpt-4o')
    expect(useSettingsStore.getState().currentModelId).toBe('openai:gpt-4o')
  })

  it('setNeedKey toggles flag and stores masked key', () => {
    useSettingsStore.getState().setNeedKey(true, 'sk-...1234')
    expect(useSettingsStore.getState().needKey).toBe(true)
    expect(useSettingsStore.getState().maskedKey).toBe('sk-...1234')
  })

  it('setModels stores the list', () => {
    useSettingsStore.getState().setModels([{ id: 'a' }] as never)
    expect(useSettingsStore.getState().models.length).toBe(1)
  })
})
