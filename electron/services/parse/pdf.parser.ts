import { ok, err, type Result } from '@shared/types'

interface TextItem {
  str?: string
}

/** pdf → contentText：逐页提取文本（pdf.js）。损坏→E_PARSE_PDF；无文本→E_EMPTY。 */
export async function parsePdf(data: Uint8Array | Buffer): Promise<Result<string>> {
  try {
    // pdf.js 是 ESM-only，CommonJS 主进程需以动态 import 加载（避免 ERR_REQUIRE_ESM）。
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    const pdf = await getDocument({ data: bytes }).promise

    const pages: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const text = (content.items as TextItem[])
        .map((it) => it.str ?? '')
        .join(' ')
      pages.push(text)
    }

    const full = pages.join('\n').replace(/[ \t]+\n/g, '\n').trim()
    if (full.length === 0) return err('E_EMPTY', 'PDF 未提取到文本内容')
    return ok(full)
  } catch (e) {
    return err('E_PARSE_PDF', `PDF 解析失败：${(e as Error).message}`)
  }
}
