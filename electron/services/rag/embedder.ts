import { ok, err, type Result } from '@shared/types'

/** 调用云端嵌入 API 的可注入函数：输入一批文本，返回等长的向量数组。 */
export type EmbedFn = (texts: string[]) => Promise<number[][]>

/**
 * 批量生成嵌入向量。空输入不调用 API；任一批失败返回 E_EMBED。
 * 注入 EmbedFn 便于测试与切换厂商。
 */
export async function embedTexts(
  texts: string[],
  embed: EmbedFn,
  opts?: { batchSize?: number }
): Promise<Result<number[][]>> {
  if (texts.length === 0) return ok([])
  const batchSize = opts?.batchSize ?? 64

  try {
    const out: number[][] = []
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize)
      const vectors = await embed(batch)
      out.push(...vectors)
    }
    return ok(out)
  } catch (e) {
    return err('E_EMBED', `嵌入向量生成失败：${(e as Error).message}`)
  }
}
