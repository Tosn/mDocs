import { err, type Result, type DocType } from '@shared/types'
import { parseMd } from './md.parser'
import { parseTxt } from './txt.parser'
import { parsePdf } from './pdf.parser'

type ParseInput = Buffer | Uint8Array | string

function asText(data: ParseInput): Buffer | string {
  if (typeof data === 'string') return data
  return Buffer.from(data)
}

function asBytes(data: ParseInput): Uint8Array | Buffer {
  if (typeof data === 'string') return Buffer.from(data, 'utf-8')
  return data
}

/** 按文档类型分发解析；'web' 视为 markdown；不支持的类型返回 E_UNSUPPORTED。 */
export async function parseByType(type: DocType, data: ParseInput): Promise<Result<string>> {
  switch (type) {
    case 'md':
    case 'web':
      return parseMd(asText(data))
    case 'txt':
      return parseTxt(asText(data))
    case 'pdf':
      return parsePdf(asBytes(data))
    default:
      return err('E_UNSUPPORTED', `不支持的文档类型：${String(type)}`)
  }
}
