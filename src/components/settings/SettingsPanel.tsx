import { useState } from 'react'
import type { ModelInfo } from '@electron/services/llm/registry'

interface SettingsPanelProps {
  models: ModelInfo[]
  currentModelId: string | null
  needKey: boolean
  maskedKey: string | null
  privacyNotice: string
  onSelectModel: (id: string) => void
  onSaveKey: (apiKey: string) => void
}

export function SettingsPanel({
  models,
  currentModelId,
  needKey,
  maskedKey,
  privacyNotice,
  onSelectModel,
  onSaveKey
}: SettingsPanelProps) {
  const [key, setKey] = useState(maskedKey ?? '')

  return (
    <div className="settings-panel">
      <label>
        模型
        <select value={currentModelId ?? ''} onChange={(e) => onSelectModel(e.target.value)}>
          <option value="" disabled>
            选择模型
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
          <button onClick={() => onSaveKey(key)}>保存</button>
        </div>
      )}

      <p className="privacy-notice">{privacyNotice}</p>
    </div>
  )
}
