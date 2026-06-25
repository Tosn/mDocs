import { describe, it, expect } from 'vitest'
import { listModels, getModel } from './registry'

describe('llm registry', () => {
  it('lists models covering domestic and international providers', () => {
    const models = listModels()
    expect(models.length).toBeGreaterThan(0)
    const providers = new Set(models.map((m) => m.provider))
    expect(providers.has('openai')).toBe(true)
    expect(providers.has('deepseek')).toBe(true)
  })

  it('has unique model ids', () => {
    const ids = listModels().map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('looks up a model by id', () => {
    const first = listModels()[0]
    expect(getModel(first.id)?.id).toBe(first.id)
  })

  it('returns undefined for unknown id', () => {
    expect(getModel('nope:nope')).toBeUndefined()
  })

  it('exposes at least one embedding-capable model', () => {
    expect(listModels().some((m) => m.kind === 'embedding')).toBe(true)
  })

  it('includes Zhipu chat and embedding models with their baseUrl', () => {
    const chat = getModel('zhipu:glm-4-flash')
    const embed = getModel('zhipu:embedding-3')
    expect(chat?.kind).toBe('chat')
    expect(embed?.kind).toBe('embedding')
    expect(chat?.baseUrl).toContain('bigmodel.cn')
  })
})
