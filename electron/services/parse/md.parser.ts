import { ok, err, type Result } from '@shared/types'

/**
 * md → contentText：保留 markdown 正文（便于搜索/问答时命中原文与标题），
 * 仅做换行规范化与首尾去空白；空内容报错。
 */
export function parseMd(input: Buffer | string): Result<string> {
  const raw = typeof input === 'string' ? input : input.toString('utf-8')
  const text = raw.replace(/\r\n/g, '\n').trim()
  if (text.length === 0) return err('E_EMPTY', '文档内容为空')
  return ok(text)
}
