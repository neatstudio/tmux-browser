# Structured Activity 浏览器验收记录

日期：2026-07-14
范围：Activity / Attention 结构化事件面板
状态：本地验收通过；authoritative CI benchmark 待仓库变量配置后执行

## 本地会话

在仓库 worktree 根目录启动 Vite：

```bash
npm run dev:client -- --host 127.0.0.1 --port 4317
```

gstack browse 访问地址：

```text
http://127.0.0.1:4317/tests/e2e/structured-event-panel-harness.html
```

浏览器使用
`/Users/gouki/.agents/skills/gstack/browse/dist/browse`。每个 viewport 都从
新的 `goto` 开始，并在操作前等待 network idle。

## Viewport 结果

| Viewport | Attention 原因与主要 action | Activity / details | Console / network |
| --- | --- | --- | --- |
| `390x844` | 原因与 `Approve` bounding box 完全位于 dialog 和 viewport 内，二者无 overlap | 4 条普通 complete record，前 3 条完整可见且 collapsed；2 KiB 单词和独立 long command 完整保留在 details scroller；页面无横向 overflow | 仅 Vite connect debug，无 console error；details 展开前后 resource 数 `11 -> 11` |
| `768x1024` | 原因与 `Approve` 完全位于 dialog 和 viewport 内，无 clipping/overlap | 2 KiB 单词与 long command 完整保留；details、panel、page 均无横向 overflow | 仅 Vite connect debug，无 console error；resource 数 `11 -> 11` |
| `1440x900` | 原因与 `Approve` 完全位于 dialog 和 viewport 内，无 clipping/overlap | 2 KiB 单词与 long command 完整保留；details、panel、page 均无横向 overflow | 仅 Vite connect debug，无 console error；resource 数 `11 -> 11` |

独立 long command fixture 是完整 benchmark 命令，包含 `--mode compare`、
`--expected-baseline-commit`、`--baseline`、`--output`、`--report` 和
`--target-url`，不是用无空格字符串替代的伪命令。Playwright 会断言完整 command
文本未被截断，且 details scroller 的 `overflow-x` 为 `auto`。

## 交互结果

- details 在初始页面 network idle 后展开；等待 details DOM 出现后，页面 request
  count 未增加。
- 对同一 event 连续应用 300 次 streaming revision 后，`complete-1` 仍只有 1 个
  DOM row，最终摘要为 `Streaming revision 300`。
- 从 Attention toast 点击 `View details` 后，面板打开 `Attention` tab，
  `attention-1` 带 `is-selected`。
- 390px 默认 Activity 中至少 3 条普通记录完整可见；检查的前 3 条均为
  `aria-expanded="false"`，且没有 details DOM。
- 三种 viewport 的 Attention 原因与主要 action 都位于 dialog/viewport 边界内，
  不重叠、不截断。

## 截图与清理策略

本次 gstack browse 生成并人工检查了以下临时文件：

```text
/tmp/phase4-task12-specfix-390x844-activity.png
/tmp/phase4-task12-specfix-390x844-attention.png
/tmp/phase4-task12-specfix-390x844-details.png
/tmp/phase4-task12-specfix-768x1024-activity.png
/tmp/phase4-task12-specfix-768x1024-attention.png
/tmp/phase4-task12-specfix-1440x900-activity.png
/tmp/phase4-task12-specfix-1440x900-attention.png
```

截图用于本地验收，不作为仓库 fixture。完成视觉检查后删除这些 `/tmp` 文件；
Playwright `test-results/` 也在提交前删除。可复现证据由
`tests/e2e/structured-event-panel.spec.ts` 和 deterministic fixture 保留。

## Benchmark 边界

本地 provisional compare 使用固定 `structured-activity/v1` fixture。最近一次基于
`04aea66569c3ae0da65f043ab09076b0ace39bf1` 的结果为 median `68.0 ms`、
relative ratio `0.3097`，通过 `<= 300 ms` 和 `<= 1.25x` 两项预算。这只属于
`provisional-local` 证据。

authoritative benchmark 必须在同一 CI runner 上顺序测量 baseline 与 candidate。
当前外部门禁仍是仓库变量 `STRUCTURED_ACTIVITY_BASELINE_SHA`：它必须指向完成的
Phase 1 commit `519ceee4e1e84480926f3b5b5de992ac88e51b9c`。变量未配置、格式错误、commit
不可用或与 artifact 不一致时 workflow fail closed；本地结果不能替代该门禁。
