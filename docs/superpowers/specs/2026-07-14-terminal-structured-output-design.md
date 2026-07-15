# 终端结构化 Agent 输出设计

## 1. 目的

在浏览器终端中，将 Agent 主动发送的结构化 conversation message，以及已识别的 Codex 过程记录，以“摘要优先、详情按需展开”的方式展示。用户默认看到结论、状态和必要原因；点击后可以在同一终端 tab 查看完整文本、命令、代码和元数据，并可随时切回原始终端。

这份文档只定义终端内的结构化输出层。`2026-07-13-structured-summary-display-design.md` 继续负责 Activity / Attention 面板，不改变其范围。

## 2. 边界

- `conversation-message` 是 producer 声明的结构化输入。它由 `POST /api/conversation/messages` 写入，并经 `/ws/events` 实时到达客户端；当服务器配置 `TMUX_UI_HOOK_TOKEN` 时，producer 必须使用同一 token 认证。
- 原始 `/ws/terminal` PTY 输出必须按字节原样转发并继续调用 `terminal.write()`，不修改 PTY 数据、不改变输入语义。
- 当 session 没有 `conversation-message` 时，客户端可在渲染后的可见文本中识别已验证的 Codex 顶级过程记录：`Ran`、`Explored`、`Viewed Image`、`Edited`、`Waiting for agents`、`Finished waiting`、`Interacted with`、`Analyzing` 和 `Planning`。匹配对象是 xterm 已完成 ANSI 渲染并合并软换行后的纯文本逻辑行；标题必须匹配 `^[•·]\s+(PROCESS)(?:\s+.*)?$`，行首不得存在空白，其中 `PROCESS` 是上述固定集合。详情只接收以空白缩进、`└` 或 `│` 开头的后续逻辑行；第一个非空且不匹配详情语法的行结束该记录。至少识别到两条过程记录才启用 transcript DOM 视图。其他任意终端文本、ANSI/TUI 或 runtimeKind 不得触发该视图。
- 有结构化 record 的终端默认进入“Agent 输出”视图。xterm 在后台继续接收和保留 PTY 输出但不作为可见内容；用户可一键切换到“原始终端”视图。切换绝不暂停、过滤或改写 PTY。
- 没有结构化 record 且没有已识别 Codex 过程记录的 session 与普通 shell session 只显示原始终端，行为不变。
- `runtimeKind === "agent"` 只能影响未来的接入提示，不能用作隐藏或折叠原始文本的依据。
- 不额外持久化正文。conversation 输出只消费 timeline 已有内容；transcript 只消费当前 tab 的本地 xterm snapshot，并随 terminal render 更新。展开不发新的网络请求，也不增加或改变 WebSocket 协议。
- Phase 1 的关联单位是一个 tmux session 的总览。多 pane session 的 record 会显示在同一输出视图，不能声称归属于当前 pane；pane 级关联不属于本阶段。

## 3. 展示模型

客户端从同 session 的 `conversation-message` 派生 `TerminalStructuredOutputItem`：

- 仅接受 `role === "assistant"` 或 `role === "tool"` 的 record；用户输入不在该区域重复显示。
- 按 `updatedAt` 倒序排列，同一 `id` 的 revision 只保留最新快照。
- 紧凑态显示角色/工具名、摘要、状态和已知统计。
- `streaming` 显示当前摘要或“正在输出…”。`failed` 必须直接显示原因，不能只显示标题。
- 默认折叠完整内容。展开后渲染 timeline 中的 `details`，包括文本、代码、命令和已净化的 metadata。
- 展开状态只存在浏览器内存，以稳定 timeline `id` 为键；实时 revision 替换不会折叠已展开项目。
- Codex transcript 从 xterm buffer cell 深拷贝显式前景色、粗体、斜体和 dim 属性；叙述、折叠标题和展开详情都保留这些样式。DOM 只使用 `textContent` 和白名单 CSS 属性，不渲染终端输出中的 HTML。

Codex transcript 的排版继续遵循终端语义，而不是转换为卡片列表：

- 普通叙述保留快照中的物理空行；连续多个空行不得被 CSS `gap` 或文本归一化压缩成单个段落间距。
- 相邻的过程记录组成一个紧凑按钮组；空行保留但不打断相邻过程记录的分组，非空叙述出现时结束当前组。组间空行在组后的原位置渲染，不并入按钮或展开详情。每个按钮继续显示自己的 `Ran`、`Explored` 或 `Planning` 标题和原始前景色。
- 按钮组采用 transcript 级手风琴交互：同一 terminal tab 的整个 transcript 同一时间最多展开一项；点击另一项时先关闭当前项再展开目标项；再次点击已展开项时全部收起。快照更新后若展开项的稳定 `id` 已消失，则清除该展开状态。
- 折叠标题、叙述和展开详情同步当前 session 的 xterm `fontFamily`、`fontSize` 和 `lineHeight`，不继承 dashboard 的正文 UI 字体或浏览器默认 `pre` 字体。
- 过程记录不使用卡片外框、逐项分隔线或展开详情分隔线。展开层级仅通过按钮状态、内缩和轻背景区分，避免额外视觉噪音。

终端面板使用受控的 `agent-output-stream` 视图，并提供“原始终端”切换按钮。它与 xterm 使用同一 terminal frame，不进入 xterm 网格。切到 Agent 输出时，xterm 保持原有尺寸但不可见、不可点击，避免改变 tmux 行列或破坏 TUI；全局 Ctrl+C 仍发送给活动 tab。没有项目时不创建该视图。

例如，`• Ran npm test` 及其后续 `  └ 855 tests passed` 是一条过程记录；`Ran npm test`、`ping Ran host`、缩进的 `  • Ran nested task`、无顶级 bullet 的 shell 输出以及只有一条匹配记录的屏幕都不得启用 transcript DOM 视图。

## 4. 数据流

1. Agent producer 对完整快照调用 `POST /api/conversation/messages`，提供稳定的 `sessionName`、`messageId`、递增 `revision`、`summary` 和完整 `content`。若已配置 hook token，producer 同时携带该 token；没有 token 的本机部署保持既有兼容行为。
2. 服务端使用既有 timeline upsert 和 `/ws/events` 广播 canonical record。
3. dashboard store 以 `id` 和 revision 合并 record。
4. `main.ts` 按每个打开的 terminal tab 的 `sessionName` 派生结构化输出。没有结构化 record 时，再从 xterm 当前可见快照派生受限的 Codex transcript。
5. renderer 默认显示 Agent 输出视图；conversation record 显示摘要，transcript 从每次本地 xterm snapshot 重新派生，普通叙述直接显示、过程记录只显示类别并默认折叠。用户可展开全文或切回原始终端。原始 PTY WebSocket 数据流独立继续；重连不为 transcript 增加独立恢复路径。

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

生产者未知、失效或未接入且未识别到 Codex 过程记录时，系统退化为原始终端，没有隐藏、截断或伪造的摘要。用户手动选择“原始终端”后，即使后续 record、revision 或 transcript 更新到达也保持该选择，直到 tab 被关闭或用户主动切回 Agent 输出。

## 6. Phase

### Phase 1: Client Agent Output View

- 派生 session 级 conversation 输出，或在其缺失时派生受限 Codex transcript；渲染默认折叠的过程记录、直显叙述和原始终端切换。
- 处理 streaming 更新、错误原因、展开状态、视图选择与 xterm 原尺寸边界。
- conversation 使用现有 timeline realtime / reconnect 路径；transcript 使用 terminal render 后的本地 xterm snapshot，不改 terminal WebSocket 协议。

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
- 结构化区域和 Codex transcript 均不存在时，xterm 高度、键盘、复制、滚动和 PTY 内容与改动前一致；视图切换时 xterm 尺寸也保持不变。
- 每次原始 terminal output 仍调用 `terminal.write(data)`，不经结构化 renderer 过滤。
- transcript 中连续过程记录显示为紧凑按钮组，互斥展开；叙述前后的连续空行数量与 xterm 快照一致。
- 修改 session 的字体、字号或行高后，Agent 输出视图同步更新；折叠态与展开态不出现 dashboard 字体或浏览器默认等宽字体。
- 折叠按钮组和展开详情不绘制卡片外框或内容分隔线。
