export interface Chunk {
  chunkIndex: number
  text: string
  charStart: number
  charEnd: number
  tokenCount: number
}

/**
 * 文本切分：滑动窗口（带重叠），保留每块在原文中的 charStart/charEnd，供来源跳转。
 * 空白文本返回空数组。
 */
export function chunkText(
  text: string,
  opts?: { maxChars?: number; overlap?: number }
): Chunk[] {
  const maxChars = opts?.maxChars ?? 1000
  const overlap = opts?.overlap ?? 100
  if (text.trim() === '') return []

  const step = Math.max(1, maxChars - overlap)
  const chunks: Chunk[] = []
  let start = 0
  let idx = 0

  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length)
    const slice = text.slice(start, end)
    chunks.push({
      chunkIndex: idx++,
      text: slice,
      charStart: start,
      charEnd: end,
      tokenCount: Math.ceil(slice.length / 4)
    })
    if (end >= text.length) break
    start += step
  }
  return chunks
}
