import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { CHANNELS } from '@shared/channels'
import { ok, err, isOk, type ModelConfig } from '@shared/types'
import type { IpcLike } from './folder.ipc'
import { listModels } from '../services/llm/registry'
import { saveKey, hasKey, maskKey } from '../services/credential.service'

const PRIVACY_NOTICE =
  '问答与嵌入会将相关文档内容发送给你所选的模型服务商进行处理。API Key 加密存储于本机系统安全区，不会明文落库。请确认你了解并接受后再使用外部模型。'

interface ModelConfigRow {
  id: string
  provider: string
  model_name: string
  base_url: string | null
  key_ref: string
  is_active: number
  created_at: number
}

function rowToConfig(r: ModelConfigRow): ModelConfig {
  return {
    id: r.id,
    provider: r.provider,
    modelName: r.model_name,
    baseUrl: r.base_url,
    keyRef: r.key_ref,
    isActive: r.is_active === 1,
    createdAt: r.created_at
  }
}

export function registerSettingsIpc(ipcMain: IpcLike, db: Database.Database): void {
  ipcMain.handle(CHANNELS.settings.listModels, () => ok(listModels()))

  ipcMain.handle(CHANNELS.settings.getActiveModel, () => {
    const row = db.prepare(`SELECT * FROM model_configs WHERE is_active = 1 LIMIT 1`).get() as
      | ModelConfigRow
      | undefined
    return ok(row ? rowToConfig(row) : null)
  })

  ipcMain.handle(
    CHANNELS.settings.saveModel,
    (_e, input: { provider: string; modelName: string; baseUrl?: string; apiKey: string }) => {
      const id = randomUUID()
      const keyRef = id
      const saved = saveKey(db, keyRef, input.apiKey)
      if (!isOk(saved)) return err(saved.error.code, saved.error.message)

      const now = Date.now()
      const tx = db.transaction(() => {
        db.prepare(`UPDATE model_configs SET is_active = 0`).run()
        db.prepare(
          `INSERT INTO model_configs (id, provider, model_name, base_url, key_ref, is_active, created_at)
           VALUES (?, ?, ?, ?, ?, 1, ?)`
        ).run(id, input.provider, input.modelName, input.baseUrl ?? null, keyRef, now)
      })
      tx()

      const row = db.prepare(`SELECT * FROM model_configs WHERE id = ?`).get(id) as ModelConfigRow
      return ok(rowToConfig(row))
    }
  )

  ipcMain.handle(CHANNELS.settings.switchModel, (_e, modelConfigId: string) => {
    const row = db.prepare(`SELECT * FROM model_configs WHERE id = ?`).get(modelConfigId) as
      | ModelConfigRow
      | undefined
    if (!row) return err('E_NOT_FOUND', '模型配置不存在')

    db.prepare(`UPDATE model_configs SET is_active = 0`).run()
    db.prepare(`UPDATE model_configs SET is_active = 1 WHERE id = ?`).run(modelConfigId)

    const masked = maskKey(db, row.key_ref)
    return ok({
      needKey: !hasKey(db, row.key_ref),
      maskedKey: isOk(masked) ? masked.data : null
    })
  })

  ipcMain.handle(CHANNELS.settings.testModel, (_e, modelConfigId: string) => {
    const row = db.prepare(`SELECT key_ref FROM model_configs WHERE id = ?`).get(modelConfigId) as
      | { key_ref: string }
      | undefined
    if (!row) return err('E_NOT_FOUND', '模型配置不存在')
    // 真实连通性测试由 provider 在调用时反馈；此处校验已配置 Key。
    return ok({ ok: hasKey(db, row.key_ref) })
  })

  ipcMain.handle(CHANNELS.settings.getPrivacyNotice, () => ok({ text: PRIVACY_NOTICE }))
}
