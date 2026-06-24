import { describe, it, expect } from 'vitest'
import { CHANNELS, EVENTS } from './channels'

function flatten(obj: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const v of Object.values(obj)) {
    if (typeof v === 'string') out.push(v)
    else out.push(...flatten(v as Record<string, unknown>))
  }
  return out
}

describe('channels', () => {
  it('exposes exactly the 7 IPC domains', () => {
    expect(Object.keys(CHANNELS).sort()).toEqual(
      ['chat', 'crawl', 'document', 'folder', 'search', 'settings', 'trash']
    )
  })

  it('all channel + event names are unique', () => {
    const all = [...flatten(CHANNELS), ...Object.values(EVENTS)]
    expect(new Set(all).size).toBe(all.length)
  })

  it('event names use namespaced format', () => {
    expect(EVENTS.chatToken).toBe('chat:token')
    expect(EVENTS.chatSources).toBe('chat:sources')
    expect(EVENTS.chatDone).toBe('chat:done')
    expect(EVENTS.chatError).toBe('chat:error')
    expect(EVENTS.importProgress).toBe('import:progress')
  })

  it('channel names are namespaced by domain', () => {
    expect(CHANNELS.folder.list).toBe('folder:list')
    expect(CHANNELS.settings.switchModel).toBe('settings:switchModel')
  })

  it('exposes the interactive (login) crawl channel', () => {
    expect(CHANNELS.crawl.fromUrlInteractive).toBe('crawl:fromUrlInteractive')
  })

  it('exposes the document pickPaths (native dialog) channel', () => {
    expect(CHANNELS.document.pickPaths).toBe('document:pickPaths')
  })
})
