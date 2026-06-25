export interface ModelInfo {
  id: string // `${provider}:${modelName}`
  provider: string
  modelName: string
  label: string
  baseUrl?: string
  kind: 'chat' | 'embedding'
}

// 主流国内外厂商/模型（可按需增减）。id 唯一，形如 provider:model。
const MODELS: ModelInfo[] = [
  { id: 'openai:gpt-4o', provider: 'openai', modelName: 'gpt-4o', label: 'OpenAI GPT-4o', kind: 'chat' },
  { id: 'openai:gpt-4o-mini', provider: 'openai', modelName: 'gpt-4o-mini', label: 'OpenAI GPT-4o mini', kind: 'chat' },
  { id: 'openai:text-embedding-3-small', provider: 'openai', modelName: 'text-embedding-3-small', label: 'OpenAI Embedding 3 Small', kind: 'embedding' },
  { id: 'anthropic:claude-3-5-sonnet', provider: 'anthropic', modelName: 'claude-3-5-sonnet', label: 'Anthropic Claude 3.5 Sonnet', kind: 'chat' },
  { id: 'deepseek:deepseek-chat', provider: 'deepseek', modelName: 'deepseek-chat', label: 'DeepSeek Chat', baseUrl: 'https://api.deepseek.com', kind: 'chat' },
  { id: 'qwen:qwen-plus', provider: 'qwen', modelName: 'qwen-plus', label: '通义千问 Plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', kind: 'chat' },
  { id: 'qwen:text-embedding-v3', provider: 'qwen', modelName: 'text-embedding-v3', label: '通义千问 Embedding v3', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', kind: 'embedding' },
  // 智谱 GLM（OpenAI 兼容端点 /api/paas/v4，Authorization: Bearer <key>）
  { id: 'zhipu:glm-4-flash', provider: 'zhipu', modelName: 'glm-4-flash', label: '智谱 GLM-4-Flash', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', kind: 'chat' },
  { id: 'zhipu:glm-4-plus', provider: 'zhipu', modelName: 'glm-4-plus', label: '智谱 GLM-4-Plus', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', kind: 'chat' },
  { id: 'zhipu:embedding-3', provider: 'zhipu', modelName: 'embedding-3', label: '智谱 Embedding-3', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', kind: 'embedding' }
]

export function listModels(): ModelInfo[] {
  return [...MODELS]
}

export function getModel(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id)
}
