// 嵌入向量维度（默认按 text-embedding-3-small / 多数厂商 1536 维；可随模型调整）。
export const EMBEDDING_DIM = 1536

// 核心表（plan §4.1）。所有时间戳为毫秒 INTEGER；逻辑删除用 deleted_at。
export const coreTablesSql = `
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  folder_id TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('md','txt','pdf','web')),
  file_path TEXT NOT NULL,
  source_url TEXT,
  content_text TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  indexed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS doc_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  char_start INTEGER NOT NULL,
  char_end INTEGER NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trash_items (
  id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL CHECK (item_type IN ('folder','document')),
  item_id TEXT NOT NULL,
  original_parent_id TEXT,
  deleted_at INTEGER NOT NULL,
  purge_after INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS model_configs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  base_url TEXT,
  key_ref TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  model_config_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS message_sources (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  snippet TEXT NOT NULL,
  score REAL NOT NULL
);
`

// 全文搜索（FTS5，独立内容表；document_id 不参与索引）。
export const ftsSql = `
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  document_id UNINDEXED,
  name,
  content_text
);
`

// 向量检索表（sqlite-vec / vec0）——需先加载 sqlite-vec 扩展，故由 db/index 在 openDb 时执行。
export function vecSql(dim: number = EMBEDDING_DIM): string {
  return `CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vec USING vec0(
  chunk_id TEXT PRIMARY KEY,
  embedding FLOAT[${dim}]
);`
}

// 索引（plan §4.2）。
export const indexesSql = `
CREATE INDEX IF NOT EXISTS idx_folder_parent ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_document_folder ON documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_trash_purge ON trash_items(purge_after);
`
