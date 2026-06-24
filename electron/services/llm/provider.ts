import { ok, err, type Result } from '@shared/types'

export interface ChatReq {
  model: string
  apiKey: string
  baseUrl?: string
  messages: { role: string; content: string }[]
}

export interface EmbedReq {
  model: string
  apiKey: string
  baseUrl?: string
  texts: string[]
}

export type StreamFn = (req: ChatReq) => AsyncIterable<string>
export type EmbedApiFn = (req: EmbedReq) => Promise<number[][]>

/** 统一流式聊天：把传输层产出的 token 增量逐个 yield。传输可注入（测试/切换厂商）。 */
export async function* chatStream(req: ChatReq, streamFn: StreamFn = defaultStream): AsyncGenerator<string> {
  for await (const delta of streamFn(req)) yield delta
}

/** 统一嵌入调用，错误包装为 Result。 */
export async function embed(req: EmbedReq, embedFn: EmbedApiFn = defaultEmbed): Promise<Result<number[][]>> {
  try {
    return ok(await embedFn(req))
  } catch (e) {
    return err('E_EMBED', `嵌入调用失败：${(e as Error).message}`)
  }
}

// ── 默认传输：OpenAI 兼容端点（openai / deepseek / qwen compatible-mode 等） ──
const OPENAI_BASE = 'https://api.openai.com/v1'

async function* defaultStream(req: ChatReq): AsyncIterable<string> {
  const res = await fetch(`${req.baseUrl ?? OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.apiKey}` },
    body: JSON.stringify({ model: req.model, messages: req.messages, stream: true })
  })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const t = line.trim()
      if (!t.startsWith('data:')) continue
      const data = t.slice(5).trim()
      if (data === '[DONE]') return
      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta?.content
        if (delta) yield delta as string
      } catch {
        /* 忽略非 JSON 心跳行 */
      }
    }
  }
}

async function defaultEmbed(req: EmbedReq): Promise<number[][]> {
  const res = await fetch(`${req.baseUrl ?? OPENAI_BASE}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.apiKey}` },
    body: JSON.stringify({ model: req.model, input: req.texts })
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as { data: { embedding: number[] }[] }
  return json.data.map((d) => d.embedding)
}
