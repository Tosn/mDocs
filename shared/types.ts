// ── Result ─────────────────────────────────────────────────────────────────
export type AppError = { code: string; message: string }

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError }

export function ok<T>(data: T): Result<T> {
  return { ok: true, data }
}

export function err(code: string, message: string): Result<never> {
  return { ok: false, error: { code, message } }
}

export function isOk<T>(r: Result<T>): r is { ok: true; data: T } {
  return r.ok === true
}

export function isErr<T>(r: Result<T>): r is { ok: false; error: AppError } {
  return r.ok === false
}

// ── Entities (plan §4) ───────────────────────────────────────────────────────
export type DocType = 'md' | 'txt' | 'pdf' | 'web'

export interface Folder {
  id: string
  name: string
  parentId: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface Document {
  id: string
  folderId: string | null
  name: string
  type: DocType
  filePath: string
  sourceUrl: string | null
  contentText: string
  contentHash: string
  size: number
  indexedAt: number | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface DocChunk {
  id: string
  documentId: string
  chunkIndex: number
  text: string
  charStart: number
  charEnd: number
  tokenCount: number
}

export interface TrashItem {
  id: string
  itemType: 'folder' | 'document'
  itemId: string
  originalParentId: string | null
  deletedAt: number
  purgeAfter: number
}

export interface ModelConfig {
  id: string
  provider: string
  modelName: string
  baseUrl: string | null
  keyRef: string
  isActive: boolean
  createdAt: number
}

export interface Setting {
  key: string
  value: string
}

export interface ChatSession {
  id: string
  title: string
  modelConfigId: string | null
  createdAt: number
  updatedAt: number
}

export interface ChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

export interface MessageSource {
  id: string
  messageId: string
  documentId: string
  chunkId: string
  snippet: string
  score: number
  /** 来源文档名（用于直接展示标题，运行时填充，不落 message_sources 表）。 */
  documentName?: string
}

// ── DTOs (plan §5) ───────────────────────────────────────────────────────────
export interface TreeNode {
  id: string
  name: string
  parentId: string | null
  children: TreeNode[]
  /** 该文件夹直接包含的文档数（不含子文件夹）。 */
  docCount: number
}

export interface SearchHit {
  documentId: string
  name: string
  snippet: string
  charStart: number
}

export interface UploadReport {
  added: Document[]
  skipped: { path: string; reason: string }[]
}

export interface ImportReport {
  added: number
  skipped: number
  failed: number
}
