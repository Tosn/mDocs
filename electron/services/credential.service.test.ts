import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'

// 打桩 electron safeStorage（测试环境无 OS 凭证区）。
const { safeStorage } = vi.hoisted(() => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from('enc:' + s, 'utf-8')),
    decryptString: vi.fn((b: Buffer) => b.toString('utf-8').replace(/^enc:/, ''))
  }
}))
vi.mock('electron', () => ({ safeStorage }))

import { openDb } from '../db/index'
import { saveKey, getKey, hasKey, maskKey } from './credential.service'
import { isOk } from '@shared/types'

let db: Database.Database
beforeEach(() => {
  db = openDb(':memory:')
  safeStorage.isEncryptionAvailable.mockReturnValue(true)
})
afterEach(() => db.close())

describe('credential.service', () => {
  it('saves and retrieves a key without storing plaintext', () => {
    saveKey(db, 'openai', 'sk-secret-123456')
    const raw = db.prepare(`SELECT value FROM settings WHERE key = 'cred:openai'`).get() as {
      value: string
    }
    expect(raw.value).not.toContain('sk-secret-123456')

    const r = getKey(db, 'openai')
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data).toBe('sk-secret-123456')
  })

  it('hasKey reflects presence', () => {
    expect(hasKey(db, 'x')).toBe(false)
    saveKey(db, 'x', 'k123456789')
    expect(hasKey(db, 'x')).toBe(true)
  })

  it('maskKey masks the middle of the key', () => {
    saveKey(db, 'openai', 'sk-abcdefgh1234')
    const r = maskKey(db, 'openai')
    expect(isOk(r)).toBe(true)
    if (isOk(r)) {
      expect(r.data).not.toBeNull()
      expect(r.data).toContain('...')
      expect(r.data).not.toBe('sk-abcdefgh1234')
    }
  })

  it('maskKey returns null when key absent', () => {
    const r = maskKey(db, 'none')
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data).toBeNull()
  })

  it('errors on save when encryption is unavailable', () => {
    safeStorage.isEncryptionAvailable.mockReturnValueOnce(false)
    const r = saveKey(db, 'y', 'k')
    expect(r.ok).toBe(false)
  })
})
