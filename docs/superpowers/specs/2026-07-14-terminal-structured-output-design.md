# 终端结构化 Agent 输出设计

## 1. 目的

在浏览器终端中，将 Agent 主动发送的结构化 conversation message 以“摘要优先、详情按需展开”的方式展示。用户默认看到结论、状态和必要原因；点击后可以在同一终端 tab 查看完整文本、命令、代码和元数据，并可随时切回原始终端。

这份文档只定义终端内的结构化输出层。`2026-07-13-structured-summary-display-design.md` 继续负责 Activity / Attention 面板，不改变其范围。

## 2. 边界

- `conversation-message` 是 producer 声明的结构化输入。它由 `POST /api/conversation/messages` 写入，并经 `/ws/events` 实时到达客户端；当服务器配置 `TMUX_UI_HOOK_TOKEN` 时，producer 必须使用同一 token 认证。
- 原始 `/ws/terminal` PTY 输出必须按字节原样转发并继续调用 `terminal.write()`。不得用正则、ANSI 解析或 runtimeKind 猜测某段输出是否属于 Agent。
- 有结构化 record 的终端默认进入“Agent 输出”视图。xterm 在后台继续接收和保留 PTY 输出但不作为可见内容；用户可一键切换到“原始终端”视图。切换绝不暂停、过滤或改写 PTY。
- 没有结构化 record 的 session 与普通 shell session 只显示原始终端，行为不变。
- `runtimeKind === "agent"` 只能影响未来的接入提示，不能用作隐藏或折叠原始文本的依据。
- 不额外持久化正文。终端层只消费 timeline 已有内容，展开不发新的网络请求。
- Phase 1 的关联单位是一个 tmux session 的总览。多 pane session 的 record 会显示在同一输出视图，不能声称归属于当前 pane；pane 级关联不属于本阶段。

## 3. 展示模型

客户端从同 session 的 `conversation-message` 派生 `TerminalStructuredOutputItem`：

- 仅接受 `role === "assistant"` 或 `role === "tool"` 的 record；用户输入不在该区域重复显示。
- 按 `updatedAt` 倒序排列，同一 `id` 的 revision 只保留最新快照。
- 紧凑态显示角色/工具名、摘要、状态和已知统计。
- `streaming` 显示当前摘要或“正在输出…”。`failed` 必须直接显示原因，不能只显示标题。
- 默认折叠完整内容。展开后渲染 timeline 中的 `details`，包括文本、代码、命令和已净化的 metadata。
- 展开状态只存在浏览器内存，以稳定 timeline `id` 为键；实时 revision 替换不会折叠已展开项目。

终端面板使用受控的 `agent-output-stream` 视图，并提供“原始终端”切换按钮。它与 xterm 使用同一 terminal frame，不进入 xterm 网格。切到 Agent 输出时，xterm 保持原有尺寸但不可见、不可点击，避免改变 tmux 行列或破坏 TUI；全局 Ctrl+C 仍发送给活动 tab。没有项目时不创建该视图。

## 4. 数据流

1. Agent producer 对完整快照调用 `POST /api/conversation/messages`，提供稳定的 `sessionName`、`messageId`、递增 `revision`、`summary` 和完整 `content`。若已配置 hook token，producer 同时携带该 token；没有 token 的本机部署保持既有兼容行为。
2. 服务端使用既有 timeline upsert 和 `/ws/events` 广播 canonical record。
3. dashboard store 以 `id` 和 revision 合并 record。
4. `main.ts` 按每个打开的 terminal tab 的 `sessionName` 派生结构化输出，并调用 terminal stream renderer。
5. renderer 只渲染已适配的 record，默认显示 Agent 输出视图；用户可展开全文或切回原始终端。原始 PTY WebSocket 数据流独立继续。

## 5. Producer 接入

已有 `tmux-ui-agent-hook.mjs` 继续只处理权限和通知 hook。新增 `agent-output` 模式，接收 JSON stdin 并调用 conversation endpoint；它不尝试抓取或重写 Codex/Claude 的屏幕输出。

`agent-output` 使用独立的 `TMUX_UI_CONVERSATION_URL`，默认值为 `http://127.0.0.1:${PORT:-3000}/api/conversation/messages`。它绝不读取、改写或从 `TMUX_UI_HOOK_URL` 推导该地址，避免把 conversation payload 误投到 `/api/hooks/events`。`TMUX_UI_HOOK_TOKEN` 仍用于 Authorization header。

helper 以当前 tmux 环境推导 `TMUX_UI_SESSION_NAME`，并要求 stdin 中的 `sessionName` 缺失或与它完全相同；不匹配时拒绝发送。最终请求的 sessionName 始终使用该推导值。服务器配置 token 时，conversation endpoint 对本机和远端请求都要求正确 token，不沿用 hook endpoint 的本机/Tailscale 免 token 规则。

输入至少包括：

```json
{
  "sessionName": "project-codex",
  "messageId": "turn-42",
  "revision": 1,
  "role": "assistant",
  "contentType": "text",
  "summary": "完成 API 调整，测试通过",
  "content": "完整 Agent 回复",
  "status": "complete"
}
```

生产者未知、失效或未接入时，系统退化为原始终端，没有隐藏、截断或伪造的摘要。用户手动选择“原始终端”后，即使后续 record 或 revision 到达也保持该选择，直到 tab 被关闭或用户主动切回 Agent 输出。

## 6. Phase

### Phase 1: Client Agent Output View

- 派生 session 级 conversation 输出，渲染默认折叠的 Agent 输出视图和原始终端切换。
- 处理 streaming 更新、错误原因、展开状态、视图选择与 xterm 原尺寸边界。
- 使用现有 timeline realtime / reconnect 路径，不改 terminal WebSocket 协议。

### Phase 2: Producer Helper And Authentication

- 为 `tmux-ui-agent-hook.mjs agent-output` 增加 conversation payload 验证、token 转发与 POST 支持。
- conversation endpoint 在配置 hook token 时复用 token 鉴权，并覆盖未配置 token 的本机兼容路径。
- 覆盖独立 conversation URL、hook URL 不会收到 conversation payload、sessionName 缺失/匹配/不匹配，以及配置 token 时本机和远端均需认证。
- 文档化 Agent producer 的快照、revision 和失败退化契约。

### Phase 3: Interaction Regression Gate

- 覆盖跨实时更新、最新 timeline 窗口内的重连恢复、复制、Ctrl+C、滚动、多 pane 与全屏程序。
- 验证视图切换不改变 xterm 尺寸、不产生错误 resize；原始 terminal `output` 仍进入 xterm，且没有结构化 record 时终端布局不改变。

## 7. 验收标准

- 已接入 Agent 在对应 terminal tab 默认显示 Agent 输出视图中的摘要，点击后可查看完整内容，也可一键切回原始终端。
- streaming revision 更新同一条输出，不产生重复卡片。
- `failed` 直接显示原因或明确的缺失原因。`blocked` 仍由 hook event 处理，不属于 conversation message 的当前状态集。
- session A 的输出绝不显示在 session B；多 pane session 明确是 session 总览，不伪装为 pane 级归属。
- 结构化区域不存在时，xterm 高度、键盘、复制、滚动和 PTY 内容与改动前一致；视图切换时 xterm 尺寸也保持不变。
- 每次原始 terminal output 仍调用 `terminal.write(data)`，不经结构化 renderer 过滤。
