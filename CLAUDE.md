# mDocs — 桌面端文档查看 / 搜索 / AI 问答工具

> 完整需求与方案见 `feature/spec.md`（需求）、`feature/plan.md`（技术方案）、`feature/tasks.md`（原子任务）。
> 本文件是项目的工作约定，改动需求/方案请先更新 `feature/*`，再据此调整本文件。

## 产品一句话
帮个人开发者把分散的文档（md/txt/pdf/网页）集中归纳，能看、能管、能搜，并通过 AI 跨文档库对话直接得到带来源的答案。

---

## 技术栈（已确认，见 plan.md §1）

| 层 | 选型 |
|----|------|
| 桌面壳 | Electron |
| 前端 | React + TypeScript + Vite + Tailwind |
| 状态 | Zustand（UI 态）+ TanStack Query（异步） |
| Markdown | react-markdown + remark/rehype |
| PDF | pdf.js (pdfjs-dist) |
| 编辑器 | CodeMirror 6 |
| 本地库 | SQLite（better-sqlite3） |
| 全文搜索 | SQLite FTS5（离线） |
| 向量检索 | sqlite-vec（KNN） |
| 嵌入 | 云端嵌入 API（随所选厂商） |
| 网页爬取 | @mozilla/readability + turndown |
| LLM | Vercel AI SDK（多厂商、流式） |
| 凭据 | Electron safeStorage（OS 安全区） |
| 测试 | Vitest（+ @testing-library/react） |
| 打包 | electron-builder |

---

## 架构原则（见 plan.md §1–§2）

- **主进程（`electron/`）**：承担所有文件、数据库、爬取、RAG、LLM 调用等特权/重活。
- **渲染进程（`src/`）**：纯 UI，仅通过 `preload` 暴露的 `window.api` 与主进程通信，**不直接碰文件系统与密钥**。
- **通信**：`contextBridge` + `ipcMain.handle / ipcRenderer.invoke`，按业务域分组，通道名集中在 `shared/channels.ts`。
- **本地优先**：查看 / 管理 / 关键词搜索完全离线；仅 AI 问答、嵌入、网页爬取需联网。

## 目录结构（见 plan.md §3）
```
electron/   主进程：main / preload / ipc/ / services/ (parse rag llm) / db/ / startup/
src/        渲染：App / pages / components/ / stores/ / api/ / hooks/ / types/
shared/     主/渲染共享：types.ts（实体/DTO/Result）、channels.ts（通道名）
feature/    spec.md / plan.md / tasks.md
```

## 数据模型与接口（见 plan.md §4–§5）
- 实体：`Folder` `Document(md/txt/pdf/web)` `DocChunk` `TrashItem` `ModelConfig` `Setting` `ChatSession` `ChatMessage` `MessageSource`。
- 虚拟表：`documents_fts`（FTS5）、`chunk_vec`（sqlite-vec）。
- 所有 IPC 统一返回 `Result<T> = { ok:true; data } | { ok:false; error:{code,message} }`。
- IPC 域：`folder / document / search / trash / crawl / chat / settings`；流式与进度走事件通道（`chat:token|sources|done|error`、`import:progress`）。

---

## 开发规则与产品不变量

详见 **`.claude/rules.md`**（开发流程、编码纪律、架构边界、必须守住的产品不变量）。动手前务必先读。

要点速记：RIPER 流程 · TDD 奇测偶实 · 单文件任务 · 完成改 `tasks.md` 状态 · 以 spec 为准 · 前端样式先用 `/ui-ux-pro-max` · 离线降级 / 回答标来源 / 回收站 7 天 / 密钥进 safeStorage。

---

## 常用命令
```bash
rtk pnpm install      # 安装依赖（构建脚本经 pnpm.onlyBuiltDependencies 放行，含 better-sqlite3）
rtk pnpm dev          # 启动应用（会先 install-app-deps 把原生模块按 Electron ABI 重编）
rtk pnpm test         # 跑测试（pretest 自动 rebuild:node 切回 Node ABI，无需手动）
rtk pnpm build        # electron-vite 三端打包
```

### 原生模块双 ABI（重要）
`better-sqlite3` 是原生模块，**Node（测试用，ABI 127）与 Electron（运行用，ABI 130）ABI 不同**，同一份 `.node` 只能服务其一：
- 跑应用：`pnpm dev` 已链式执行 `electron-builder install-app-deps`（= `pnpm rebuild:electron`）自动按 Electron ABI 重编。
- 跑测试：需 Node ABI。`pnpm test` 的 `pretest` 钩子会自动 `npm run rebuild:node`，即便刚跑过应用（Electron ABI）也会先切回 Node ABI，无需手动；如需手动恢复仍可 `pnpm rebuild:node`。
- `pnpm install` 后默认是 Node ABI（测试可直接跑）。
另：`pdfjs-dist` 为 ESM-only，主进程以动态 `import()` 加载（见 `electron/services/parse/pdf.parser.ts`）。
