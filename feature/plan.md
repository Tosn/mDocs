# 技术方案（Technical Plan）

> 配套需求：`feature/spec.md`
> 范围：桌面端文档查看 / 搜索 / AI 问答工具的首版（MVP，全部 P0）。
> 版本：v1  日期：2026-06-24

---

## 1. 技术栈选型（已确认）

| 层 | 选型 | 说明 |
|----|------|------|
| 桌面壳 | **Electron** | 生态最成熟，pdf/md 渲染、网页爬取、AI SDK 开箱即用。 |
| 前端框架 | **React + TypeScript + Vite** | 主流组合，开发效率高。 |
| 样式 | **Tailwind CSS** | 快速搭建桌面 UI。 |
| 状态管理 | **Zustand**（UI/客户端态）+ **TanStack Query**（异步数据） | 轻量、易维护。 |
| Markdown 渲染 | **react-markdown + remark/rehype** | 渲染 md 正文。 |
| PDF 阅读 | **pdf.js (pdfjs-dist)** | 翻页阅读。 |
| 文本编辑器 | **CodeMirror 6** | md/txt 在预览中编辑。 |
| 本地数据库 | **SQLite（better-sqlite3）** | 单文件、零运维、同步 API 适合主进程。 |
| 全文搜索 | **SQLite FTS5** | 本地关键词搜索，**离线可用**。 |
| 向量检索 | **sqlite-vec**（向量列 + KNN） | 与主库同库，简化运维。 |
| 嵌入向量 | **云端嵌入 API**（随所选厂商） | 简单、质量高；需隐私告知（spec E5）。 |
| 网页爬取 | **@mozilla/readability + turndown** | 正文抽取 → md；图片等富媒体一并保留。 |
| LLM 接入 | **Vercel AI SDK**（统一多厂商）/ 各厂商 SDK | 支持主流国内外模型、流式输出。 |
| 凭据存储 | **Electron safeStorage**（OS 安全凭证区） | API Key 加密落盘，不入明文 DB。 |
| 打包 | **electron-builder** | 跨平台分发。 |

**架构原则**
- **主进程（main）**：承担所有文件、数据库、爬取、RAG、LLM 调用等「特权 / 重活」，渲染进程不直接触碰文件系统与密钥。
- **渲染进程（renderer）**：纯 UI + 通过受控的 `preload` 暴露的 API 与主进程通信。
- **通信**：`contextBridge` + `ipcMain.handle / ipcRenderer.invoke`，按业务域分组，通道名集中常量化。
- **本地优先**：查看 / 管理 / 关键词搜索完全离线；仅 AI 问答与嵌入、网页爬取需联网（spec「降级」要求）。

---

## 2. 系统架构概览

```
┌────────────────────────── Renderer (React) ──────────────────────────┐
│  目录树 │ 文档预览/编辑 │ 搜索面板 │ 对话面板 │ 设置                       │
│         └──────────── src/api（封装 window.api）─────────────┘          │
└───────────────────────────────┬───────────────────────────────────────┘
                          contextBridge (preload)
                                 │  invoke/handle
┌───────────────────────────────┴───────────────────────────────────────┐
│                          Main Process (Node)                           │
│  ipc/* ──► services/*                                                  │
│   ├─ document / folder / trash   ──► db (SQLite + FTS5 + sqlite-vec)    │
│   ├─ search                      ──► FTS5                              │
│   ├─ crawl (readability+turndown)──► 文件落盘 + 入库                    │
│   │    └─ 交互式登录爬取：主进程开 BrowserWindow 复用会话，登录后抓当前页 │
│   ├─ rag (chunk→embed→retrieve)  ──► 嵌入API + 向量检索（可按 @范围 过滤）│
│   ├─ llm (provider registry)     ──► 各厂商模型（流式）                  │
│   └─ credential (safeStorage)    ──► OS 凭证区                          │
│  startup/trash-gc：启动时清理过期回收站                                 │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 目录结构

```
mDocs/
├── electron/                      # 主进程
│   ├── main.ts                    # 应用入口、窗口创建、启动钩子
│   ├── preload.ts                 # contextBridge 暴露 window.api
│   ├── channels.ts                # IPC 通道名常量（与 shared 共享）
│   ├── ipc/                       # IPC 处理层（薄，参数校验 + 调 service）
│   │   ├── document.ipc.ts
│   │   ├── folder.ipc.ts
│   │   ├── trash.ipc.ts
│   │   ├── search.ipc.ts
│   │   ├── crawl.ipc.ts
│   │   ├── chat.ipc.ts
│   │   └── settings.ipc.ts
│   ├── services/                  # 业务逻辑
│   │   ├── document.service.ts
│   │   ├── folder.service.ts
│   │   ├── trash.service.ts
│   │   ├── search.service.ts
│   │   ├── crawl.service.ts
│   │   ├── crawl-login.service.ts # 交互式登录爬取（BrowserWindow + 手动抓取）
│   │   ├── credential.service.ts
│   │   ├── parse/                 # 文档解析 → 纯文本
│   │   │   ├── index.ts           # 按类型分发
│   │   │   ├── md.parser.ts
│   │   │   ├── txt.parser.ts
│   │   │   └── pdf.parser.ts
│   │   ├── rag/
│   │   │   ├── chunker.ts         # 切分
│   │   │   ├── embedder.ts        # 调云端嵌入 API
│   │   │   ├── retriever.ts       # 向量 KNN + 可选关键词融合（可按 @范围 过滤）
│   │   │   ├── scope.ts           # @文件/@文件夹 范围解析（文件夹递归展开）
│   │   │   └── prompt.ts          # 拼装带来源约束的提示
│   │   └── llm/
│   │       ├── registry.ts        # 厂商/模型注册表
│   │       └── provider.ts        # 统一聊天/嵌入调用封装
│   ├── db/
│   │   ├── index.ts               # 连接、迁移执行
│   │   ├── schema.ts              # 表与索引定义
│   │   └── migrations/            # 版本化迁移脚本
│   └── startup/
│       └── trash-gc.ts            # 启动时清理过期回收站项
├── src/                           # 渲染进程（React）
│   ├── main.tsx
│   ├── App.tsx                    # 三栏布局：目录树 / 主区 / 对话
│   ├── pages/
│   ├── components/
│   │   ├── tree/                  # 目录树、右键菜单、新建/重命名/删除
│   │   ├── viewer/                # md/txt/pdf 预览
│   │   ├── editor/                # CodeMirror 编辑 + 未保存拦截
│   │   ├── search/                # 搜索框 + 结果列表
│   │   ├── chat/                  # 对话气泡、来源标注、流式渲染、@范围选择器
│   │   ├── crawl/                 # 添加网页对话框（普通 / 需登录交互）
│   │   └── settings/              # 模型选择 + API Key 弹框 + 隐私告知
│   ├── api/                       # 封装 window.api.*（按域）
│   ├── stores/                    # zustand：tree / editor / chat / settings
│   ├── hooks/
│   └── types/
├── shared/                        # 主/渲染共享
│   ├── types.ts                   # DTO / 实体类型
│   └── channels.ts                # 通道名常量来源
├── resources/                     # 图标等
├── electron.vite.config.ts
├── electron-builder.yml
├── package.json
├── tsconfig.json
└── feature/                       # spec.md / plan.md
```

---

## 4. 核心数据模型

> 单一 SQLite 文件（位于用户数据目录）。逻辑删除用 `deleted_at`；FTS5 与 sqlite-vec 为虚拟表。下列以类型声明描述字段含义（非建表实现）。

### 4.1 实体

```ts
// 文件夹（树形，自引用）
interface Folder {
  id: string;                 // uuid
  name: string;
  parentId: string | null;    // null = 根
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;   // 非空 = 在回收站
}

// 文档
type DocType = 'md' | 'txt' | 'pdf' | 'web';

interface Document {
  id: string;
  folderId: string | null;
  name: string;
  type: DocType;
  filePath: string;           // 应用数据目录内的实际文件路径
  sourceUrl: string | null;   // web 类型保留原链接
  contentText: string;        // 提取后的纯文本（供搜索/RAG）
  contentHash: string;        // 内容指纹，去重/判断是否需重建索引
  size: number;
  indexedAt: number | null;   // 向量/全文索引完成时间（null=未索引）
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

// RAG 切片
interface DocChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  charStart: number;          // 在 contentText 中的偏移，用于来源跳转
  charEnd: number;
  tokenCount: number;
}

// 回收站条目
interface TrashItem {
  id: string;
  itemType: 'folder' | 'document';
  itemId: string;
  originalParentId: string | null; // 恢复目标父级
  deletedAt: number;
  purgeAfter: number;               // = deletedAt + 7 天，到期由启动 GC 清理
}

// 模型配置（API Key 不存此处，存 OS 安全区，按 keyRef 引用）
interface ModelConfig {
  id: string;
  provider: string;           // openai / deepseek / anthropic / qwen ...
  modelName: string;
  baseUrl: string | null;
  keyRef: string;             // safeStorage 中的引用键
  isActive: boolean;          // 当前选中
  createdAt: number;
}

// 设置（键值，存最近所用模型、嵌入配置、隐私告知是否已读等）
interface Setting { key: string; value: string; /* JSON */ }

// 对话
interface ChatSession {
  id: string;
  title: string;
  modelConfigId: string | null;
  createdAt: number;
  updatedAt: number;
}

interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

// 回答的来源标注（一条 assistant 消息对应多条来源）
interface MessageSource {
  id: string;
  messageId: string;
  documentId: string;
  chunkId: string;
  snippet: string;            // 命中片段摘录
  score: number;              // 相关度
}
```

### 4.2 虚拟表 / 索引

| 名称 | 类型 | 用途 |
|------|------|------|
| `documents_fts` | FTS5 | 对 `name + contentText` 全文检索（关键词搜索，离线）。 |
| `chunk_vec` | sqlite-vec | 存储 chunk 嵌入向量，KNN 相似度检索（RAG）。 |
| `idx_folder_parent` | B-Tree | 加速目录树展开。 |
| `idx_document_folder` | B-Tree | 加速按目录列文档。 |
| `idx_trash_purge` | B-Tree | 启动 GC 按 `purgeAfter` 扫描。 |

---

## 5. 接口定义（IPC API）

> 渲染进程通过 `window.api`（preload 暴露）调用；每个方法对应一个通道。统一返回 `Result<T>`：

```ts
type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
```

### 5.1 文件夹 `window.api.folder`

```ts
list(parentId: string | null): Promise<Result<Folder[]>>;
tree(): Promise<Result<TreeNode[]>>;                 // 完整目录树（不含回收站）
create(input: { name: string; parentId: string | null }): Promise<Result<Folder>>;
rename(id: string, name: string): Promise<Result<Folder>>;   // 重名/非法名 → error
delete(id: string): Promise<Result<void>>;           // 移入回收站（含子项）
```

### 5.2 文档 `window.api.document`

```ts
listByFolder(folderId: string | null): Promise<Result<Document[]>>;
get(id: string): Promise<Result<Document>>;          // 含 contentText
getFileUrl(id: string): Promise<Result<string>>;     // pdf 等二进制预览用
upload(input: { paths: string[]; folderId: string | null;
  onConflict?: 'keepBoth' | 'overwrite' | 'cancel' }): Promise<Result<UploadReport>>;
                                                     // paths 可为文件或文件夹（spec A1 统一入口）：
                                                     // 文件夹按原层级递归上传、跳过不支持格式、进度见事件
importFolder(input: { dirPath: string; folderId: string | null }):
  Promise<Result<ImportReport>>;                     // A2 详细批量：递归、跳过汇总、可取消、进度见事件
createDoc(input: { name: string; folderId: string | null;
  contentText: string }): Promise<Result<Document>>; // 应用内新建
updateContent(id: string, contentText: string): Promise<Result<Document>>; // 预览中编辑保存
rename(id: string, name: string): Promise<Result<Document>>;
delete(id: string): Promise<Result<void>>;           // 移入回收站
```

```ts
interface UploadReport { added: Document[]; skipped: { path: string; reason: string }[]; }
interface ImportReport { added: number; skipped: number; failed: number; }
```

### 5.3 网页爬取 `window.api.crawl`

```ts
fromUrl(input: { url: string; folderId: string | null }):
  Promise<Result<Document>>;   // 抽正文→md（含图片）→落盘→入库；失败返回明确 error.code
fromUrlInteractive(input: { url: string; folderId: string | null }):
  Promise<Result<Document>>;   // 需登录场景：开内置窗口，用户登录/导航后「抓取当前页」→md 入库；取消→error
```

### 5.4 搜索 `window.api.search`

```ts
keyword(input: { query: string; limit?: number }): Promise<Result<SearchHit[]>>;
```

```ts
interface SearchHit {
  documentId: string; name: string;
  snippet: string;            // 高亮片段
  charStart: number;          // 命中位置，供跳转
}
```

### 5.5 回收站 `window.api.trash`

```ts
list(): Promise<Result<TrashEntry[]>>;
restore(id: string): Promise<Result<void>>;          // 原父级不存在 → 落默认位置并提示
purge(id: string): Promise<Result<void>>;            // 主动彻底删除（需 UI 二次确认）
```

### 5.6 对话 / RAG `window.api.chat`

```ts
listSessions(): Promise<Result<ChatSession[]>>;
createSession(): Promise<Result<ChatSession>>;
getMessages(sessionId: string): Promise<Result<ChatMessage[]>>;
ask(input: { sessionId: string; question: string;
  scope?: { documentIds?: string[]; folderIds?: string[] } }):
  Promise<Result<{ messageId: string }>>;            // 触发流式回答，token 经事件推送
                                                     // scope：@范围（文件/文件夹），缺省=全库（spec E6）
```

流式与进度通过**事件通道**（主→渲染 `webContents.send`）：

```ts
window.api.on('chat:token',  (p: { messageId: string; delta: string }) => void);
window.api.on('chat:sources',(p: { messageId: string; sources: MessageSource[] }) => void);
window.api.on('chat:done',   (p: { messageId: string }) => void);
window.api.on('chat:error',  (p: { messageId: string; code: string; message: string }) => void);
window.api.on('import:progress', (p: { done: number; total: number }) => void);
```

### 5.7 设置 / 模型 `window.api.settings`

```ts
listModels(): Promise<Result<ModelConfig[]>>;
getActiveModel(): Promise<Result<ModelConfig | null>>;     // 启动默认沿用上次（E4）
switchModel(modelConfigId: string): Promise<Result<{ needKey: boolean; maskedKey?: string }>>;
                                                            // 切换时告知前端是否需弹 Key 框、回填掩码
saveModel(input: { provider: string; modelName: string;
  baseUrl?: string; apiKey: string }): Promise<Result<ModelConfig>>;  // Key 入 safeStorage
testModel(modelConfigId: string): Promise<Result<{ ok: boolean }>>;
getPrivacyNotice(): Promise<Result<{ text: string }>>;     // 隐私告知文案
```

---

## 6. RAG 问答管线（spec E1–E3）

1. **入库时**：解析 → `contentText` → `chunker` 切分 → `embedder` 调云端嵌入 API → 写 `chunk_vec`，更新 `indexedAt`。
2. **范围解析（spec E6）**：若 `ask` 带 `scope` → `rag/scope.ts` 把 `folderIds` 递归展开为 `documentIds`（合并 `scope.documentIds`、剔除已删除文档）；无 scope 则不限定（全库）。
3. **提问时**：问题向量化 → `retriever` 在 `chunk_vec` 做 KNN（可与 FTS5 关键词召回做轻量融合，**并按范围内的 documentIds 过滤候选**）→ 取 Top-K chunk。
4. **生成时**：`prompt` 拼装「仅依据给定片段回答；无依据须回答未找到；需给出来源」的约束上下文 → 调 LLM 流式输出。
5. **来源标注**：把命中 chunk 落 `MessageSource`，前端经 `chat:sources` 渲染可点击来源，点击经 `charStart` 跳转预览定位。
6. **边界**：空库 → 直接提示「请先添加文档」；无召回（含 @范围内无答案）→ 明确「未在文档中找到相关内容」；@范围为空 → 提示范围为空；模型未配置/超时 → `chat:error` + 重试入口。

---

## 7. 实施阶段

> 全部为 MVP P0；按依赖顺序分期，每期可独立验收。括号内为对应 spec 用户故事。

### 阶段 0：脚手架与基础设施
- Electron + Vite + React + TS 工程；三栏布局骨架；SQLite 连接与迁移框架；通道常量与 `Result` 约定。
- 验收：应用可启动，空状态界面正常。

### 阶段 1：文档入库与目录管理（A1/A2/A3、B1/B2）
- 解析器（md/txt/pdf → contentText）；统一上传入口（文件或文件夹）/ 文件夹批量导入（含进度、跳过汇总、可取消）/ 应用内新建；目录树新建、重命名、多级展开。
- 验收：spec A1–A3、B1–B2 验收标准通过。

### 阶段 2：预览与编辑（C1/C2）
- md 渲染、txt 文本、pdf 翻页；CodeMirror 编辑 + 保存持久化 + 未保存拦截；pdf 编辑限制提示。
- 验收：spec C1–C2 通过。

### 阶段 3：关键词搜索（D1）
- FTS5 索引随入库/编辑同步；搜索框 + 结果列表 + 命中跳转 + 空状态；离线可用。
- 验收：spec D1 通过；断网下可搜索。

### 阶段 4：AI 问答与模型设置（E1–E6）
- 模型注册表 + 设置面板 + 切换弹 Key（回填掩码）+ safeStorage；隐私告知；chunk/embed/retrieve 管线；流式对话 + 来源标注 + 无答案/超时处理；启动默认沿用上次模型。
- **@范围（E6）**：`rag/scope.ts` 解析 + retriever 按 documentIds 过滤 + ChatPanel 的 @文件/@文件夹 选择器。
- 验收：spec E1–E6 通过。

### 阶段 5：网页爬取入库（A4）
- readability 抽正文 + turndown 转 md + 图片保留 + 原链接留存；失败明确提示、不落空文档。
- **需登录（A4）**：`crawl-login.service.ts` 开内置 `BrowserWindow`，用户登录/导航后「抓取当前页」→ 复用 html→md→入库；取消不落空文档。
- 验收：spec A4 通过（含需登录场景）。

### 阶段 6：删除 / 回收站 + 启动清理（B3）
- 删除二次确认 → 入回收站；恢复（含原父级缺失兜底）；主动彻底删除；`startup/trash-gc` 启动清过期项。
- 验收：spec B3 通过。

### 阶段 7：边界打磨与降级
- 统一空状态、错误提示、超大文件/损坏文件、批量中断一致性、无网降级横幅；隐私告知首启展示。
- 验收：spec 第 6 章边界情况逐条覆盖。

---

## 8. 实施清单

```
实施清单：
1.  初始化 Electron + Vite + React + TS 工程，落地 electron/ src/ shared/ 目录骨架与 electron.vite 配置。
2.  搭建 SQLite 连接（better-sqlite3）、迁移框架与首版 schema（folders/documents/doc_chunks/trash_items/model_configs/settings/chat_*）。
3.  集成 sqlite-vec 与 FTS5 虚拟表，建立 4.2 节索引。
4.  定义 shared/channels.ts 通道常量与 shared/types.ts 实体/DTO/Result 类型。
5.  实现 preload 暴露 window.api（folder/document/crawl/search/trash/chat/settings 七域）。
6.  渲染层搭建三栏布局与各域 src/api 封装、zustand stores。
7.  实现 parse/（md/txt/pdf → contentText）解析分发。
8.  实现 folder.service 与 IPC：list/tree/create/rename/delete（重名与非法名校验）。
9.  实现 document.service 与 IPC：上传、文件夹批量导入（进度事件、跳过汇总、冲突处理）、应用内新建。
10. 实现目录树组件：多级展开/折叠、右键新建/重命名/删除。
11. 实现 viewer（md/txt/pdf）与 editor（CodeMirror 保存 + 未保存拦截 + pdf 限制提示）。
12. 实现 search.service（FTS5）与搜索面板：结果列表、命中跳转、空状态、离线可用。
13. 实现 credential.service（safeStorage）与 settings IPC：模型列表/切换/保存 Key/回填掩码/测试连通。
14. 实现 settings 面板：模型选择、切换弹 Key 框、隐私告知、启动默认沿用上次模型。
15. 实现 rag/（chunker/embedder/retriever/prompt）与入库时的索引构建。
16. 实现 llm/registry 与 provider（多厂商、流式），chat IPC 与事件（token/sources/done/error）。
17. 实现对话面板：流式渲染、来源标注与点击跳转、空库/无答案/超时处理。
18. 实现 crawl.service（readability + turndown + 图片保留 + 原链接），crawl IPC 与失败提示。
19. 实现 trash.service 与 IPC：删除二次确认入站、恢复（父级缺失兜底）、主动彻底删除。
20. 实现 startup/trash-gc：应用启动时清理 purgeAfter 到期项。
21. 边界与降级打磨：空状态、错误提示、超大/损坏文件、批量中断一致性、无网降级横幅、首启隐私告知。
22. 配置 electron-builder 打包，按 spec 第 5–6 章逐项回归验收。
```
