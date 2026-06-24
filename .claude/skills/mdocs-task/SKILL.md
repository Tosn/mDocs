---
name: mdocs-task
description: Drive the next atomic TDD task from feature/tasks.md for the mDocs project. Use when the user wants to implement the next task, continue the build, do the next test/impl step, or check task progress. Enforces test-first (odd=test, even=impl), one-file-per-task, and updates task status.
---

# mDocs Task Runner

按 `feature/tasks.md` 的原子任务顺序，推进 mDocs 项目的实现。严格遵守 `.claude/rules.md`。

## 何时使用
- 用户说「下一个任务」「继续做」「写下一个测试/实现」「跑一下进度」等。
- 参数（可选）：任务编号（如 `21`）直接定位；`status` 仅汇报进度不动手。

## 执行步骤

1. **读取状态**：打开 `feature/tasks.md`，找到第一个行首为 `⬜` 的任务（或用户指定的编号）。同时读 `.claude/rules.md` 与相关的 `feature/spec.md` / `feature/plan.md` 章节。

2. **确认模式**：本技能涉及写代码，需用户已给出 `EXECUTE` 指令（RIPER）。若当前不在 EXECUTE，先停下，用一句话说明将要做的任务并请求 `EXECUTE`。

3. **判定任务类型**（由编号奇偶决定，不可违反）：
   - **奇数 = 写测试**：只创建/修改该任务列出的**测试文件**。测试应覆盖对应 spec 验收标准与 plan 接口契约；此时实现文件可能尚不存在（红灯正常）。**不要**为了让测试通过去写实现。
   - **偶数 = 写实现**：只创建/修改该任务列出的**实现文件**，目标是让上一条（N-1）测试转绿。**不得修改测试文件**。

4. **单文件纪律**：本次只改任务声明的那**一个文件**。若发现需要改动其它文件，停下说明，按需在 `tasks.md` 增补新任务，不要顺手改。

5. **运行测试**：实现任务（偶数）完成后运行 `rtk vitest run <相关测试>` 确认转绿；测试任务（奇数）完成后运行确认其按预期**失败**（红）。报告真实结果，不掩饰失败。

6. **更新进度**：完成后把 `tasks.md` 中该任务行首 `⬜` 改为 `✅`，并同步文末「进度概览」计数。

7. **收尾**：用一行说明完成了哪个任务、测试红/绿结果、以及下一个任务编号。一次只推进一个任务，除非用户要求连续多个。

## 约束
- 不引入 spec「非目标」。
- 所有 shell 命令加 `rtk` 前缀。
- 前置 Setup（S1–S6 脚手架）无测试，可直接执行，但仍一次一个文件并更新状态。
- 遇到与 spec/plan 冲突或歧义，先停下提问，不擅自决策。
