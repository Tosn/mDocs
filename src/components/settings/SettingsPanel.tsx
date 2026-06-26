import { useEffect, useState } from 'react'
import type { ModelInfo } from '@electron/services/llm/registry'

interface ModelSectionProps {
  testId: string
  title: string
  placeholder: string
  models: ModelInfo[] // 已按 kind 过滤
  currentModelId: string | null
  needKey: boolean
  maskedKey: string | null
  onSelectModel: (id: string) => void
  onSaveKey: (apiKey: string) => void
}

/** 单个「模型 + API Key」配置小节，对话模型与嵌入模型各用一份。 */
function ModelKeySection({
  testId,
  title,
  placeholder,
  models,
  currentModelId,
  needKey,
  maskedKey,
  onSelectModel,
  onSaveKey
}: ModelSectionProps) {
  const [key, setKey] = useState(maskedKey ?? '')

  // 切换模型 / 回显密文时，把输入框同步为该模型已存的密文 Key（或清空）。
  useEffect(() => {
    setKey(maskedKey ?? '')
  }, [maskedKey, currentModelId])

  const configured = maskedKey !== null

  return (
    <div className="model-section" data-testid={testId}>
      <label>
        {title}
        <select value={currentModelId ?? ''} onChange={(e) => onSelectModel(e.target.value)}>
          <option value="" disabled>
            {placeholder}
          </option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {needKey && (
        <div className="api-key">
          <input
            type="password"
            placeholder="API Key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <button onClick={() => onSaveKey(key.trim())} disabled={key.trim() === ''}>
            保存
          </button>
          {configured && (
            <span className="api-key-hint">已配置，不改直接保存沿用原 Key；输入新值可更新</span>
          )}
        </div>
      )}
    </div>
  )
}

interface SettingsPanelProps {
  models: ModelInfo[]
  // 对话模型
  currentModelId: string | null
  needKey: boolean
  maskedKey: string | null
  onSelectModel: (id: string) => void
  onSaveKey: (apiKey: string) => void
  // 嵌入模型（用于检索，独立配置）
  currentEmbedId: string | null
  embedNeedKey: boolean
  embedMaskedKey: string | null
  onSelectEmbed: (id: string) => void
  onSaveEmbedKey: (apiKey: string) => void
  onReindex?: () => void
  reindexing?: boolean
  onExport?: () => void
  onImport?: () => void
  privacyNotice: string
}

export function SettingsPanel({
  models,
  currentModelId,
  needKey,
  maskedKey,
  onSelectModel,
  onSaveKey,
  currentEmbedId,
  embedNeedKey,
  embedMaskedKey,
  onSelectEmbed,
  onSaveEmbedKey,
  onReindex,
  reindexing = false,
  onExport,
  onImport,
  privacyNotice
}: SettingsPanelProps) {
  const chatModels = models.filter((m) => m.kind === 'chat')
  const embedModels = models.filter((m) => m.kind === 'embedding')

  return (
    <div className="settings-panel">
      <ModelKeySection
        testId="model-section-chat"
        title="对话模型"
        placeholder="选择对话模型"
        models={chatModels}
        currentModelId={currentModelId}
        needKey={needKey}
        maskedKey={maskedKey}
        onSelectModel={onSelectModel}
        onSaveKey={onSaveKey}
      />

      <ModelKeySection
        testId="model-section-embed"
        title="嵌入模型（用于文档检索）"
        placeholder="选择嵌入模型"
        models={embedModels}
        currentModelId={currentEmbedId}
        needKey={embedNeedKey}
        maskedKey={embedMaskedKey}
        onSelectModel={onSelectEmbed}
        onSaveKey={onSaveEmbedKey}
      />

      {onReindex && currentEmbedId && (
        <div className="reindex-row">
          <button onClick={onReindex} disabled={reindexing}>
            {reindexing ? '重建索引中…' : '重建文档索引'}
          </button>
          <span className="api-key-hint">换嵌入模型或导入大量文档后，可手动重建索引。</span>
        </div>
      )}

      {(onExport || onImport) && (
        <div className="data-migration" data-testid="data-migration">
          <span className="data-migration-title">数据迁移</span>
          <div className="data-migration-actions">
            {onExport && <button onClick={onExport}>导出文档库</button>}
            {onImport && <button onClick={onImport}>导入文档库</button>}
          </div>
          <span className="api-key-hint">
            导出为单个 JSON（含 PDF），换电脑后用「导入」即可迁移文件夹与文档（不含模型/会话）。
          </span>
        </div>
      )}

      <p className="privacy-notice">{privacyNotice}</p>
    </div>
  )
}
