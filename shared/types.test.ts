import { describe, it, expect } from 'vitest'
import { ok, err, isOk, isErr } from './types'

describe('Result helpers', () => {
  it('ok() wraps data', () => {
    const r = ok(42)
    expect(r).toEqual({ ok: true, data: 42 })
    expect(isOk(r)).toBe(true)
    expect(isErr(r)).toBe(false)
  })

  it('err() wraps code + message', () => {
    const r = err('E_BAD', 'bad thing')
    expect(r).toEqual({ ok: false, error: { code: 'E_BAD', message: 'bad thing' } })
    expect(isErr(r)).toBe(true)
    expect(isOk(r)).toBe(false)
  })

  it('isOk narrows to data branch', () => {
    const r = ok('x')
    if (isOk(r)) expect(r.data).toBe('x')
    else throw new Error('expected ok')
  })

  it('isErr narrows to error branch', () => {
    const r = err('E', 'm')
    if (isErr(r)) expect(r.error.code).toBe('E')
    else throw new Error('expected err')
  })
})
