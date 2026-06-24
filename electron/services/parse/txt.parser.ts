import { ok, err, type Result } from '@shared/types'

/** txt → contentText：解码、规范化换行、去首尾空白；空内容报错。 */
export function parseTxt(input: Buffer | string): Result<string> {
  const raw = typeof input === 'string' ? input : input.toString('utf-8')
  const text = raw.replace(/\r\n/g, '\n').trim()
  if (text.length === 0) return err('E_EMPTY', '文档内容为空')
  return ok(text)
}
