import type Database from 'better-sqlite3'
import { safeStorage } from 'electron'
import { ok, err, isOk, type Result } from '@shared/types'

// API Key 经 safeStorage 加密后，以 base64 存入 settings（key 前缀 cred:），不落明文 DB。
const PREFIX = 'cred:'

export function saveKey(db: Database.Database, keyRef: string, apiKey: string): Result<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    return err('E_NO_ENCRYPTION', '系统加密不可用，无法安全保存 API Key')
  }
  const enc = safeStorage.encryptString(apiKey).toString('base64')
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(PREFIX + keyRef, enc)
  return ok(undefined)
}

export function getKey(db: Database.Database, keyRef: string): Result<string> {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(PREFIX + keyRef) as
    | { value: string }
    | undefined
  if (!row) return err('E_NOT_FOUND', '未找到该 API Key')
  try {
    return ok(safeStorage.decryptString(Buffer.from(row.value, 'base64')))
  } catch {
    return err('E_DECRYPT', 'API Key 解密失败')
  }
}

export function hasKey(db: Database.Database, keyRef: string): boolean {
  return !!db.prepare(`SELECT 1 FROM settings WHERE key = ?`).get(PREFIX + keyRef)
}

/** 返回掩码形式（如 `sk-...1234`）；不存在返回 null。用于 UI 回填提示，不泄露完整 Key。 */
export function maskKey(db: Database.Database, keyRef: string): Result<string | null> {
  if (!hasKey(db, keyRef)) return ok(null)
  const r = getKey(db, keyRef)
  if (!isOk(r)) return err(r.error.code, r.error.message)
  const k = r.data
  const masked = k.length <= 8 ? '***' : `${k.slice(0, 3)}...${k.slice(-4)}`
  return ok(masked)
}
