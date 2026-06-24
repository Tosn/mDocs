export interface PromptChunk {
  documentId: string
  chunkId: string
  text: string
}

export interface ChatMessageInput {
  role: 'system' | 'user'
  content: string
}

const SYSTEM_PROMPT = `你是文档库问答助手。严格遵守以下规则：
1. 只能依据下方提供的「资料片段」回答，不得编造或使用片段之外的知识。
2. 若资料片段中没有相关内容，必须明确回答「未在文档中找到相关内容」，不要臆测。
3. 回答中必须用 [来源N] 标注依据的片段编号（N 对应资料片段序号），便于用户核对。
4. 用简洁、准确的中文回答。`

/** 拼装带「仅依据片段 / 无依据答未找到 / 标注来源」约束的对话消息（spec E2/E3）。 */
export function buildMessages(input: {
  question: string
  chunks: PromptChunk[]
}): ChatMessageInput[] {
  const context =
    input.chunks.length === 0
      ? '（无可用资料片段）'
      : input.chunks
          .map((c, i) => `[资料片段 ${i + 1}]\n${c.text}`)
          .join('\n\n')

  const user = `以下是检索到的资料片段：

${context}

请根据上述资料回答问题（无依据时回答「未在文档中找到相关内容」）：
${input.question}`

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user }
  ]
}
