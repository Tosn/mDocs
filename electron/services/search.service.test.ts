import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openDb } from '../db/index'
import { createDoc, deleteDoc } from './document.service'
import { keywordSearch } from './search.service'
import { isOk } from '@shared/types'

let db: Database.Database
beforeEach(() => {
  db = openDb(':memory:')
})
afterEach(() => db.close())

describe('search.service', () => {
  it('finds documents by content keyword', () => {
    createDoc(db, { name: 'alpha', folderId: null, contentText: 'the quick brown fox' })
    createDoc(db, { name: 'beta', folderId: null, contentText: 'lazy dog sleeps' })

    const r = keywordSearch(db, { query: 'brown' })
    expect(isOk(r)).toBe(true)
    if (isOk(r)) {
      expect(r.data.length).toBe(1)
      expect(r.data[0].name).toBe('alpha')
      expect(r.data[0].snippet).toContain('brown')
      expect(r.data[0].charStart).toBeGreaterThanOrEqual(0)
    }
  })

  it('matches by file name too', () => {
    createDoc(db, { name: 'readme', folderId: null, contentText: 'content here' })
    const r = keywordSearch(db, { query: 'readme' })
    if (isOk(r)) expect(r.data.length).toBe(1)
  })

  it('returns empty for no match', () => {
    createDoc(db, { name: 'a', folderId: null, contentText: 'hello world' })
    const r = keywordSearch(db, { query: 'zzz' })
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data.length).toBe(0)
  })

  it('returns empty for blank query', () => {
    const r = keywordSearch(db, { query: '   ' })
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.data.length).toBe(0)
  })

  it('excludes deleted documents', () => {
    const c = createDoc(db, { name: 'gone', folderId: null, contentText: 'secret keyword here' })
    if (isOk(c)) deleteDoc(db, c.data.id)
    const r = keywordSearch(db, { query: 'secret' })
    if (isOk(r)) expect(r.data.length).toBe(0)
  })

  it('does not throw on queries with FTS special characters', () => {
    createDoc(db, { name: 'x', folderId: null, contentText: 'normal text' })
    const r = keywordSearch(db, { query: 'a "b( c)' })
    expect(isOk(r)).toBe(true)
  })
})
