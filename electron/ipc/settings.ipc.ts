import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { CHANNELS } from '@shared/channels'
import { ok, err, isOk, type ModelConfig } from '@shared/types'
import type { IpcLike } from './folder.ipc'
import { listModels, getModel } from '../services/llm/registry'
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

// 激活的嵌入模型 config id 存于 settings（与对话模型的 is_active 解耦）。
const EMBED_SETTING = 'active_embed_config'

function activeEmbedId(db: Database.Database): string | null {
  const r = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(EMBED_SETTING) as
    | { value: string }
    | undefined
  return r?.value ?? null
}

function setActiveEmbedId(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(EMBED_SETTING, id)
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

  ipcMain.handle(CHANNELS.settings.getActiveEmbedModel, () => {
    const id = activeEmbedId(db)
    if (!id) return ok(null)
    const row = db.prepare(`SELECT * FROM model_configs WHERE id = ?`).get(id) as
      | ModelConfigRow
      | undefined
    return ok(row ? rowToConfig(row) : null)
  })

  ipcMain.handle(
    CHANNELS.settings.saveModel,
    (
      _e,
      input: {
        provider: string
        modelName: string
        baseUrl?: string
        apiKey: string
        role?: 'chat' | 'embedding'
      }
    ) => {
      const role = input.role ?? 'chat'
      // 按 (provider, modelName) upsert：同一模型只保留一行/一份 key，改 key 即更新该行。
      const existing = db
        .prepare(`SELECT * FROM model_configs WHERE provider = ? AND model_name = ?`)
        .get(input.provider, input.modelName) as ModelConfigRow | undefined

      const id = existing?.id ?? randomUUID()
      const keyRef = existing?.key_ref ?? id
      const saved = saveKey(db, keyRef, input.apiKey)
      if (!isOk(saved)) return err(saved.error.code, saved.error.message)

      // 未显式给 baseUrl 时，用注册表中该模型的 baseUrl（DeepSeek/Qwen 必需，否则会打到 OpenAI 端点）。
      const baseUrl =
        input.baseUrl ?? getModel(`${input.provider}:${input.modelName}`)?.baseUrl ?? null

      const tx = db.transaction(() => {
        if (existing) {
          db.prepare(`UPDATE model_configs SET base_url = ? WHERE id = ?`).run(baseUrl, id)
        } else {
          db.prepare(
            `INSERT INTO model_configs (id, provider, model_name, base_url, key_ref, is_active, created_at)
             VALUES (?, ?, ?, ?, ?, 0, ?)`
          ).run(id, input.provider, input.modelName, baseUrl, keyRef, Date.now())
        }
        if (role === 'chat') {
          db.prepare(`UPDATE model_configs SET is_active = 0`).run()
          db.prepare(`UPDATE model_configs SET is_active = 1 WHERE id = ?`).run(id)
        } else {
          setActiveEmbedId(db, id) // 嵌入模型：只记激活的嵌入配置，不动对话模型的 is_active。
        }
      })
      tx()

      const row = db.prepare(`SELECT * FROM model_configs WHERE id = ?`).get(id) as ModelConfigRow
      return ok(rowToConfig(row))
    }
  )

  // 选择某模型（按 provider+modelName）：命中已配置则激活并回显密文 Key，未配置返回空。
  ipcMain.handle(
    CHANNELS.settings.selectModel,
    (_e, input: { provider: string; modelName: string; role?: 'chat' | 'embedding' }) => {
      const role = input.role ?? 'chat'
      const row = db
        .prepare(`SELECT * FROM model_configs WHERE provider = ? AND model_name = ?`)
        .get(input.provider, input.modelName) as ModelConfigRow | undefined
      if (!row) return ok({ configId: null, maskedKey: null, configured: false })

      if (role === 'chat') {
        db.prepare(`UPDATE model_configs SET is_active = 0`).run()
        db.prepare(`UPDATE model_configs SET is_active = 1 WHERE id = ?`).run(row.id)
      } else {
        setActiveEmbedId(db, row.id)
      }

      const masked = maskKey(db, row.key_ref)
      return ok({
        configId: row.id,
        maskedKey: isOk(masked) ? masked.data : null,
        configured: hasKey(db, row.key_ref)
      })
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
