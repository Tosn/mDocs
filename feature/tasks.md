# 原子任务列表（Tasks）

> 配套：`feature/spec.md`、`feature/plan.md`
> 技术栈：Electron + React + TS + SQLite(better-sqlite3 / FTS5 / sqlite-vec) + Vitest

## 约定

- **状态**：`⬜` 未完成 / `✅` 已完成。完成一项后把行首的 `⬜` 改为 `✅`。
- **单文件**：每个任务**只改一个文件**。
- **测试先行**：编号主列表中 **奇数 = 写测试**，**偶数 = 写实现**；任务 `N`（奇）的测试与任务 `N+1`（偶）的实现配成一对，先红后绿。
- **测试框架**：Vitest；React 组件用 `@testing-library/react`；主进程用内存 SQLite、对外部依赖（safeStorage / 网络 / 嵌入 API / LLM）打桩。
- **前置 Setup（S 系列）**：纯脚手架/配置文件无单元测试，单列于下方，不参与奇偶配对。

---

## 前置 Setup（脚手架，无单测）

- ✅ S1. `package.json` — 依赖与脚本（electron、vite、react、ts、vitest、better-sqlite3、sqlite-vec、pdfjs-dist、@mozilla/readability、turndown、ai SDK 等）。
- ✅ S2. `electron.vite.config.ts` — 主/预加载/渲染三构建配置。
- ✅ S3. `tsconfig.json` — 路径别名（electron/ src/ shared/）与编译选项。
- ✅ S4. `vitest.config.ts` — 测试环境（node + jsdom 分项目）、覆盖率。
- ✅ S5. `tailwind.config.ts` + `postcss.config.js` — 样式管线。
- ✅ S6. `electron-builder.yml` — 打包配置。

---

## 阶段 0：共享契约与数据库

- ✅ 1. (测试) `shared/types.test.ts` — 校验 `ok()/err()/isOk()/isErr()` 行为与 `Result<T>` 守卫。
- ✅ 2. (实现) `shared/types.ts` — 实体/DTO 类型 + `Result<T>` 与 `ok/err/isOk/isErr` 助手。
- ✅ 3. (测试) `shared/channels.test.ts` — 断言所有通道名唯一、键齐全（7 域 + 事件通道）。
- ✅ 4. (实现) `shared/channels.ts` — IPC 通道名常量集中定义。
- ✅ 5. (测试) `electron/db/schema.test.ts` — 内存库应用 schema 后，表/虚拟表/索引齐全。
- ✅ 6. (实现) `electron/db/schema.ts` — 表、FTS5、sqlite-vec 虚拟表与索引 DDL。
- ✅ 7. (测试) `electron/db/migrations/001_init.test.ts` — 迁移 up 建库、版本号写入、可重复执行。
- ✅ 8. (实现) `electron/db/migrations/001_init.ts` — 首版迁移脚本。
- ✅ 9. (测试) `electron/db/index.test.ts` — `openDb()` 幂等执行迁移并返回连接。
- ✅ 10. (实现) `electron/db/index.ts` — 连接、加载 sqlite-vec、运行迁移。

---

## 阶段 1：文档解析

- ✅ 11. (测试) `electron/services/parse/txt.parser.test.ts` — 提取纯文本、空内容→错误。
- ✅ 12. (实现) `electron/services/parse/txt.parser.ts` — txt → contentText。
- ✅ 13. (测试) `electron/services/parse/md.parser.test.ts` — 保留正文文本、规范化。
- ✅ 14. (实现) `electron/services/parse/md.parser.ts` — md → contentText。
- ✅ 15. (测试) `electron/services/parse/pdf.parser.test.ts` — 样例 pdf 抽取文本、损坏文件→错误。
- ✅ 16. (实现) `electron/services/parse/pdf.parser.ts` — pdf → contentText（pdf.js）。
- ✅ 17. (测试) `electron/services/parse/index.test.ts` — 按类型分发、不支持格式→错误。
- ✅ 18. (实现) `electron/services/parse/index.ts` — 解析分发器。

---

## 阶段 2：核心服务（目录 / 文档 / 搜索）

- ✅ 19. (测试) `electron/services/folder.service.test.ts` — create/list/tree、重名与非法名拒绝、delete 入回收站（含子项）。
- ✅ 20. (实现) `electron/services/folder.service.ts` — 文件夹业务逻辑。
- ✅ 21. (测试) `electron/services/document.service.test.ts` — upload（文件或文件夹、冲突策略）、importFolder（跳过/汇总/可取消）、createDoc、updateContent、rename、delete。
- ✅ 22. (实现) `electron/services/document.service.ts` — 文档业务逻辑（含内容指纹与索引标记）。
- ✅ 23. (测试) `electron/services/search.service.test.ts` — FTS5 关键词返回命中+snippet+charStart、空查询、离线。
- ✅ 24. (实现) `electron/services/search.service.ts` — 关键词搜索（FTS5）。

---

## 阶段 3：预览/编辑相关服务支撑

> 预览读取走 `document.get/getFileUrl`（已在阶段 2）；本阶段补编辑保存的索引同步校验。

- ✅ 25. (测试) `electron/services/trash.service.test.ts` — list、restore（原父级缺失→默认位置）、purge。
- ✅ 26. (实现) `electron/services/trash.service.ts` — 回收站业务逻辑。
- ✅ 27. (测试) `electron/services/credential.service.test.ts` — save/get/掩码（safeStorage 打桩），keyRef 引用。
- ✅ 28. (实现) `electron/services/credential.service.ts` — API Key 安全存取。

---

## 阶段 4：网页爬取

- ✅ 29. (测试) `electron/services/crawl.service.test.ts` — html→md（readability+turndown 打桩）、图片保留、无效/空/超时→明确错误码、不落空文档。
- ✅ 30. (实现) `electron/services/crawl.service.ts` — 抽正文→md→落盘→入库。

---

## 阶段 5：RAG 管线

- ✅ 31. (测试) `electron/services/rag/chunker.test.ts` — 按长度切分、charStart/charEnd 偏移正确、边界。
- ✅ 32. (实现) `electron/services/rag/chunker.ts` — 文本切分。
- ✅ 33. (测试) `electron/services/rag/embedder.test.ts` — 批量调云端嵌入 API（打桩）、返回向量、失败处理。
- ✅ 34. (实现) `electron/services/rag/embedder.ts` — 嵌入向量生成。
- ✅ 35. (测试) `electron/services/rag/retriever.test.ts` — chunk_vec KNN 取 TopK、与 FTS5 融合、空结果、**按 scope 的 documentIds 过滤候选**。
- ✅ 36. (实现) `electron/services/rag/retriever.ts` — 向量检索（支持 documentIds 范围过滤）。
- ✅ 37. (测试) `electron/services/rag/prompt.test.ts` — 拼装「仅依据片段/无依据答未找到/需来源」约束、空上下文。
- ✅ 38. (实现) `electron/services/rag/prompt.ts` — 提示构造。

---

## 阶段 6：LLM 与对话编排

- ⬜ 39. (测试) `electron/services/llm/registry.test.ts` — 列出主流厂商/模型、按 id 查找。
- ⬜ 40. (实现) `electron/services/llm/registry.ts` — 模型注册表。
- ⬜ 41. (测试) `electron/services/llm/provider.test.ts` — 流式 chat 产出 token（打桩）、embed 调用、错误/超时。
- ⬜ 42. (实现) `electron/services/llm/provider.ts` — 多厂商统一调用封装。
- ⬜ 43. (测试) `electron/services/chat.service.test.ts` — ask：空库→提示、无召回→「未找到」、流式 token、落 MessageSource、持久化消息、**应用 scope 限定范围（含范围为空提示）**。
- ⬜ 44. (实现) `electron/services/chat.service.ts` — 问答编排（scope 解析→检索→提示→流式→来源）。

---

## 阶段 7：启动清理

- ⬜ 45. (测试) `electron/startup/trash-gc.test.ts` — 清除 purgeAfter 到期项、保留未到期项。
- ⬜ 46. (实现) `electron/startup/trash-gc.ts` — 启动时回收站 GC。

---

## 阶段 8：IPC 层（薄：校验 + 调 service + 包 Result）

- ⬜ 47. (测试) `electron/ipc/folder.ipc.test.ts` — 注册通道、参数校验、Result 映射。
- ⬜ 48. (实现) `electron/ipc/folder.ipc.ts` — 文件夹 IPC。
- ⬜ 49. (测试) `electron/ipc/document.ipc.test.ts` — 含 import:progress 事件转发。
- ⬜ 50. (实现) `electron/ipc/document.ipc.ts` — 文档 IPC。
- ⬜ 51. (测试) `electron/ipc/search.ipc.test.ts` — 关键词通道。
- ⬜ 52. (实现) `electron/ipc/search.ipc.ts` — 搜索 IPC。
- ⬜ 53. (测试) `electron/ipc/trash.ipc.test.ts` — list/restore/purge 通道。
- ⬜ 54. (实现) `electron/ipc/trash.ipc.ts` — 回收站 IPC。
- ⬜ 55. (测试) `electron/ipc/crawl.ipc.test.ts` — fromUrl / **fromUrlInteractive** 通道与错误码透传。
- ⬜ 56. (实现) `electron/ipc/crawl.ipc.ts` — 爬取 IPC（含交互式登录爬取）。
- ⬜ 57. (测试) `electron/ipc/chat.ipc.test.ts` — ask 触发、chat:token/sources/done/error 事件转发。
- ⬜ 58. (实现) `electron/ipc/chat.ipc.ts` — 对话 IPC。
- ⬜ 59. (测试) `electron/ipc/settings.ipc.test.ts` — listModels/switchModel(回填掩码)/saveModel/testModel/隐私文案。
- ⬜ 60. (实现) `electron/ipc/settings.ipc.ts` — 设置 IPC。

---

## 阶段 9：进程入口与桥接

- ⬜ 61. (测试) `electron/preload.test.ts` — contextBridge 暴露 window.api 含 7 域 + on() 事件订阅（打桩）。
- ⬜ 62. (实现) `electron/preload.ts` — 预加载桥接。
- ⬜ 63. (测试) `electron/main.test.ts` — bootstrap：注册全部 IPC、ready 时调用 trash-gc（打桩）。
- ⬜ 64. (实现) `electron/main.ts` — 应用入口、窗口、启动钩子。

---

## 阶段 10：渲染层 API 封装

- ⬜ 65. (测试) `src/api/folder.api.test.ts` — 调 window.api.folder、透传 Result。
- ⬜ 66. (实现) `src/api/folder.api.ts` — 文件夹 API 封装。
- ⬜ 67. (测试) `src/api/document.api.test.ts` — 文档 API 调用与事件订阅。
- ⬜ 68. (实现) `src/api/document.api.ts` — 文档 API 封装。
- ⬜ 69. (测试) `src/api/search.api.test.ts` — 搜索 API。
- ⬜ 70. (实现) `src/api/search.api.ts` — 搜索 API 封装。
- ⬜ 71. (测试) `src/api/trash.api.test.ts` — 回收站 API。
- ⬜ 72. (实现) `src/api/trash.api.ts` — 回收站 API 封装。
- ⬜ 73. (测试) `src/api/crawl.api.test.ts` — 爬取 API（fromUrl / fromUrlInteractive）。
- ⬜ 74. (实现) `src/api/crawl.api.ts` — 爬取 API 封装（含交互式登录爬取）。
- ⬜ 75. (测试) `src/api/chat.api.test.ts` — 对话 API + 流式事件回调 + **ask 透传 scope**。
- ⬜ 76. (实现) `src/api/chat.api.ts` — 对话 API 封装（透传 scope）。
- ⬜ 77. (测试) `src/api/settings.api.test.ts` — 设置 API。
- ⬜ 78. (实现) `src/api/settings.api.ts` — 设置 API 封装。

---

## 阶段 11：渲染层状态

- ⬜ 79. (测试) `src/stores/tree.store.test.ts` — 展开/折叠、增删改后状态同步。
- ⬜ 80. (实现) `src/stores/tree.store.ts` — 目录树 store。
- ⬜ 81. (测试) `src/stores/editor.store.test.ts` — dirty 标记、未保存拦截状态。
- ⬜ 82. (实现) `src/stores/editor.store.ts` — 编辑器 store。
- ⬜ 83. (测试) `src/stores/chat.store.test.ts` — 流式 token 累积、来源附加、错误态。
- ⬜ 84. (实现) `src/stores/chat.store.ts` — 对话 store。
- ⬜ 85. (测试) `src/stores/settings.store.test.ts` — 当前模型、切换需 Key 标记。
- ⬜ 86. (实现) `src/stores/settings.store.ts` — 设置 store。

---

## 阶段 12：渲染层组件

- ⬜ 87. (测试) `src/components/tree/FolderTree.test.tsx` — 多级展开、右键新建/重命名/删除二次确认。
- ⬜ 88. (实现) `src/components/tree/FolderTree.tsx` — 目录树组件。
- ⬜ 89. (测试) `src/components/viewer/DocViewer.test.tsx` — md 渲染/txt 文本/pdf 翻页、长文滚动。
- ⬜ 90. (实现) `src/components/viewer/DocViewer.tsx` — 预览组件。
- ⬜ 91. (测试) `src/components/editor/DocEditor.test.tsx` — 编辑保存、未保存离开拦截、pdf 限制提示。
- ⬜ 92. (实现) `src/components/editor/DocEditor.tsx` — 编辑组件。
- ⬜ 93. (测试) `src/components/search/SearchPanel.test.tsx` — 结果列表、命中跳转、空状态。
- ⬜ 94. (实现) `src/components/search/SearchPanel.tsx` — 搜索面板。
- ⬜ 95. (测试) `src/components/chat/ChatPanel.test.tsx` — 流式渲染、来源可点击跳转、空库/无答案/超时提示、**@文件/@文件夹 选择器并随提问带 scope**。
- ⬜ 96. (实现) `src/components/chat/ChatPanel.tsx` — 对话面板（含 @范围选择器）。
- ⬜ 97. (测试) `src/components/settings/SettingsPanel.test.tsx` — 模型选择、切换弹 Key 框回填掩码、隐私告知、默认沿用上次模型。
- ⬜ 98. (实现) `src/components/settings/SettingsPanel.tsx` — 设置面板。

---

## 阶段 13：应用装配

- ⬜ 99. (测试) `src/App.test.tsx` — 三栏布局渲染、无网降级横幅、首启隐私告知。
- ⬜ 100. (实现) `src/App.tsx` — 主应用装配。

---

## 阶段 14：@问答范围（需求 1，spec E6）

> 与阶段 4 一起做；retriever/chat/api/ChatPanel 的范围接线已并入任务 35/36、43/44、75/76、95/96 的描述。

- ⬜ 101. (测试) `electron/services/rag/scope.test.ts` — resolveScope：@文件→对应文档；@文件夹→递归其下文档；空范围→null（=全库）；排除已删除文档。
- ⬜ 102. (实现) `electron/services/rag/scope.ts` — 范围解析（导出 `ChatScope` 类型与 `resolveScope(db, scope)`）。

---

## 阶段 15：登录网页爬取（需求 2，spec A4）

> 与阶段 5 一起做；crawl.ipc / crawl.api 的接线已并入任务 55/56、73/74 的描述。

- ⬜ 103. (测试) `shared/channels.test.ts` — 断言新增 `crawl.fromUrlInteractive` 通道存在且唯一。
- ⬜ 104. (实现) `shared/channels.ts` — 增加 `crawl.fromUrlInteractive` 通道名。
- ⬜ 105. (测试) `electron/services/crawl-login.service.test.ts` — 打桩 `BrowserWindow`：开窗口→用户「抓取当前页」→取渲染 HTML→复用 crawl 的 html→md→入库；取消→明确 error、不落空文档。
- ⬜ 106. (实现) `electron/services/crawl-login.service.ts` — 交互式登录爬取编排（复用 `crawl.service` 的 html→md→入库）。
- ⬜ 107. (测试) `src/components/crawl/AddWebDialog.test.tsx` — 输入 URL；普通抓取 vs 需登录走交互窗口；失败/取消提示。
- ⬜ 108. (实现) `src/components/crawl/AddWebDialog.tsx` — 添加网页对话框。

---

## 验收回归（手动核对，无新文件）

- ⬜ R1. 按 `spec.md` 第 5 章逐条用户故事验收（A1–A4 / B1–B3 / C1–C2 / D1 / E1–E6）。
- ⬜ R2. 按 `spec.md` 第 6 章逐条边界情况核对（含无网降级、回收站启动清理、网页爬取失败、**@范围失效、登录爬取中断**）。
- ⬜ R3. 手动验收：@文件/@文件夹 限定问答范围；需登录网页的内置窗口登录后抓取当前页。

---

### 进度概览

- 前置 Setup：6 / 6 ✅
- TDD 主任务：38 / 108（测试 19 / 实现 19）—— 阶段 0–5 完成；新增阶段 14/15（任务 101–108）待办
- 验收回归：0 / 3
