# 结构化消息摘要展示设计

## 1. 背景

tmux-ui 已支持两类结构化数据：

- `conversation-message` 通过 timeline 持久化，并通过 `/ws/events` 实时广播；
- `hook-event` 支持 `summary`、`text`、`code`、`details` 内容块，以及可执行 action。

当前客户端没有形成统一的信息呈现：`conversation-message` 到达后只触发 timeline 刷新，并未作为会话内容展示；Action Center 又只筛选少量 actionable hook，覆盖有限，部分标题和正文依赖生产者自由填写，容易出现内容不准确或缺乏重点的问题。

本设计采用“摘要优先、详情按需展开”的 B 模式，同时覆盖普通会话消息、Toast 和 Action Center。目标不是隐藏数据，而是建立稳定的信息层级：默认显示结论、状态和下一步，需要追查时仍能查看完整正文、命令、代码和元数据。

## 2. 目标与非目标

### 2.1 目标

- 所有结构化会话消息和 hook 使用同一套摘要展示模型。
- 发送端可提供准确摘要；未提供时客户端可生成保守、确定性的降级摘要。
- 普通更新与需要用户处理的事件分流，避免 Action Center 既空洞又混乱。
- 成功信息保持紧凑；失败、阻塞、确认请求和安全警告直接显示原因与下一步。
- timeline 历史记录与 `/ws/events` 实时消息使用同一数据形状和同一渲染规则。
- 保持现有 API、旧 hook 生产者和原生客户端兼容。

### 2.2 非目标

- 不解析 `/ws/terminal` 的 ANSI/TUI 输出，也不从终端文本重建对话。
- 不在客户端调用模型生成摘要。
- 不在本轮改变 tmux 输入、PTY 传输或终端渲染。
- 不承诺从任意自由文本中推断“修改文件数”“测试数量”等事实；只有结构化数据明确提供时才展示。

## 3. 设计原则

1. **事实优先**：摘要只使用生产者明确提供的信息或当前结构字段，不推断任务是否成功。
2. **单一来源**：历史与实时数据共享 timeline record；三个 UI 表面共享同一 presentation adapter。
3. **异常前置**：`failed`、`blocked`、`waiting`、`need-input` 和 `approval-required` 不得只显示模糊摘要。
4. **详情不丢失**：折叠只影响默认展示，不删除或截断持久化内容。
5. **渐进兼容**：新增字段可选；旧生产者无需同步升级即可继续工作。

## 4. 数据契约

### 4.1 Conversation Message

在现有 `ConversationMessageTimelineEvent` 和对应 POST payload 中增加：

```ts
type ConversationMessageTimelineEvent = {
  // existing fields remain unchanged
  summary: string | null;
  revision: number;
  updatedAt: string;
};
```

约束：

- `summary` 可选输入，服务端规范化后输出为 `string | null`；
- 去除首尾空白并应用与 `content` 分离的长度上限；
- 首次创建时 `updatedAt === createdAt`；后续成功 upsert 只更新 `updatedAt`；
- timeline 保存的 record 与 `/ws/events` 广播 payload 保持相同 `summary`、`id`、`messageId` 和 `createdAt`；
- `(sessionName, messageId)` 是 conversation message 的逻辑唯一键，`id` 是首次写入时生成且后续更新保持不变的 timeline record identity；
- `sessionName`、`messageId`、`role`、`contentType`、`toolName`、`parentMessageId` 在首次写入后不可变，后续请求与首次规范化值不同时返回 `409`；
- `content` 是当前完整快照而不是增量 chunk；相同逻辑键的 streaming 请求可替换 `content`、`summary`、`metadata`、`status` 和 `updatedAt`；
- 首次写入的 `revision` 缺省为 `1`；若首次显式提供 revision，则只能为 `1`，否则返回 `400 invalid_revision`。同一逻辑键的后续更新必须显式提供 `revision === current.revision + 1`；未提供返回 `428 revision_required`，更低或重复但 payload 不同的 revision 返回 `409 stale_revision`，跳号返回 `409 revision_gap`；相同 revision 且语义 payload 相同视为幂等重试；
- 不改变现有 `messageId`、`role`、`contentType`、`content`、`status`、`toolName`、`parentMessageId` 语义。

Conversation 状态机：

| 当前状态 | 新状态 | 行为 |
| --- | --- | --- |
| 不存在 | `streaming` / `complete` / `failed` | 创建 record |
| `streaming` | `streaming` | 更新同一 record 的完整快照 |
| `streaming` | `complete` / `failed` | 更新同一 record 并进入终态 |
| `complete` / `failed` | 相同终态且语义 payload 相同 | 幂等返回现有 record |
| `complete` / `failed` | 其他状态或不同 payload | 返回 `409`，不回退或覆盖终态 |

服务端 timeline store 在 Phase 1 增加专用 upsert API；不能继续用通用 append-only `addEvent` 表达 streaming 更新。所有成功写入或更新都广播 upsert 后的 canonical record。客户端按 `id` 更新展示项；`messageId` 只用于服务端查找逻辑记录和表达父子关系。

“语义 payload 相同”比较所有规范化后的 immutable/mutable 字段（包括 `revision`），但排除服务端字段 `id`、`createdAt`、`updatedAt`。metadata 先按键名稳定排序再做深比较；不比较原始 JSON 的键顺序和无效字段。revision 校验先于状态转换校验，因此迟到快照不能覆盖较新 streaming 或终态记录。

### 4.2 Hook Event

新增显式 `HookEventTimelineEvent` 到 timeline union。它包含 `HookEvent` 的全部结构字段以及 canonical `id`、`createdAt`：

```ts
type HookEventTimelineEvent = HookEvent & {
  type: "hook-event";
  id: string;
  createdAt: string;
};

type LegacyHookEventTimelineEvent = {
  type: "hook-event";
  id: string;
  sessionName: string | null;
  message: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean | null>;
};
```

`BaseTimelineEvent.type` 排除 `conversation-message` 和 `hook-event`，timeline union 显式包含 typed 与 legacy hook 类型。两者共用 discriminator，因此通过结构守卫区分：没有 `schemaVersion` 时进入 legacy adapter；`schemaVersion === "tmux-ui.hook/v1"` 且 `status`、`actions`、`content` 和 `target` 通过运行时形状校验时进入 typed adapter；存在 `schemaVersion` 但形状损坏时生成只读的 corrupt fallback，禁用全部 action，并明确显示“事件数据损坏”，不得误走 legacy adapter。

服务端先创建并写入 typed record，再将同一个 record 广播到 `/ws/events`。Hook Event 仍为 append-only，不做 upsert。兼容窗口内，新 record 同时在 `metadata` 写入当前旧 UI 所需的 legacy JSON 投影（status、source、eventType、body、taskId、target、actions、content），顶层 typed 字段是新客户端的 canonical source。旧记录继续使用 timeline `id`；不迁移已有内存历史。移除 legacy metadata 投影需另开版本化变更，不属于本 spec。

Legacy adapter 逐字段规则与当前投影一致：`message → title`；metadata 中的 `status`、`source`、`eventType`、`body`、`taskId` 读取标量；`target`、`actions`、`content` 先读取 JSON 字符串再逐项通过现有 hook normalizer 校验。摘要只在通过校验后的 `content` 上执行 `summary → text`，再退到合法 `body`，最后退到 `message/title`。legacy `sessionName === null` 时 presentation 保留 null，并显示“未知会话”；所有需要 session 的 action 禁用。

Hook Event 不新增重复 summary 字段。其摘要来源按优先级为：

1. 第一个非空 `content[type="summary"]`；
2. 第一个非空 `content[type="text"]`；
3. `body`；
4. `title`。

`code` 和 `details` 内容块默认保留在折叠详情中。生产者显式发送 `collapsed: false` 时，仅在非紧凑详情视图中尊重该设置；Toast 始终保持紧凑。

### 4.3 可选结构化元数据

第一阶段不增加强制统计字段。展示层只读取以下白名单：

| 字段 | 类型与范围 | 展示 |
| --- | --- | --- |
| `filesChanged` | integer, `0..100000` | `N 个文件` |
| `testsPassed` | integer, `0..1000000` | `N 项测试通过` |
| `testsFailed` | integer, `0..1000000` | `N 项测试失败`，大于 0 时提升为 warning |
| `durationMs` | finite number, `0..86400000` | 统一格式化为 ms/s/min |

原始 metadata 详情只显示通过服务端规范化后的键值。服务端先将键名转小写并移除非字母数字字符；规范化键包含 `token`、`secret`、`password`、`authorization`、`cookie`，或以 `key` 结尾时，值永久替换为 `[redacted]`。字符串值按 UTF-8 字节截断到 2 KiB 并追加 `[truncated]`。原始键先按字典序处理；多个原始键得到同一规范化键时保留排序后的第一个，忽略后续碰撞键并记录诊断。规范化 metadata JSON 达到 16 KiB 后停止接收后续键，并增加保留字段 `_truncated: true`；原始超限或敏感值不写入 timeline、不广播。原始 metadata 采用惰性渲染，仅在用户展开时创建 DOM。

Hook dual-write 的 legacy 投影属于保留传输字段，不出现在“原始 metadata”详情，也不计入用户 metadata 的 16 KiB 预算；它仍受 hook payload 自身既有长度与数量上限约束。

## 5. 统一展示模型

客户端新增纯函数 adapter，将 conversation message 与 hook event 转换为统一模型：

```ts
type StructuredPresentationItem = {
  id: string;
  kind: "conversation" | "hook";
  sessionName: string | null;
  title: string;
  summary: string;
  status: "streaming" | "complete" | "failed" | "waiting" | "blocked" | "need-input" | "info";
  severity: "info" | "warning" | "error";
  attentionRequired: boolean;
  role: "user" | "assistant" | "tool" | null;
  toolName: string | null;
  parentId: string | null;
  details: StructuredDetailBlock[];
  actions: StructuredAction[];
  createdAt: string;
};
```

展示派生分为两层。`adaptStructuredRecord(record)` 是单记录纯函数，负责：

- 摘要选择与降级；
- 状态和 severity 规范化；
- attention 判断；
- 完整正文、代码、命令和原始 metadata 的详情分块；
- 规范化 `parentId`，但不执行集合关联，也不负责 DOM 渲染。

`deriveStructuredPresentation(items)` 是集合级纯函数，负责按 `parentId` 关联父子项、计算“N 个工具步骤”、将失败或待处理子项提升到父项 Attention，并对孤儿子项做独立展示。三个 UI 表面只消费该集合级输出。

### 5.1 状态与 Attention 映射

| 输入 | presentation status | 默认 attention |
| --- | --- | --- |
| conversation `streaming` | `streaming` | 否 |
| conversation `complete` | `complete` | 否 |
| conversation `failed` | `failed` | 是 |
| hook `running` | `streaming` | 否 |
| hook `done` | `complete` | 否 |
| hook `waiting` | `waiting` | 是 |
| hook `blocked` | `blocked` | 是 |
| hook `need-input` | `need-input` | 是 |
| hook `failed` | `failed` | 是 |
| hook `info` | `info` | 否 |

覆盖优先级从高到低：

1. severity `error` 强制 status 为 `failed` 且 attention 为是；
2. hook `eventType === "approval-required"` 强制 attention 为是，但保留原 status；
3. 任一 danger action 强制 attention 为是；
4. severity `warning` 本身不强制 attention，只改变视觉等级；`testsFailed > 0` 同理，除非 status 同时为失败或待处理；
5. 其余使用上表默认值。

失败原因按 `summary → text → body → title` 读取。都为空时使用固定文案“未提供失败原因”。待处理事件没有可用说明时显示“需要处理，但未提供操作说明”。

## 6. 摘要规则

### 6.1 优先级

Conversation Message：

1. 非空 `summary`；
2. `contentType` 对应的确定性摘要；
3. 通用状态摘要。

确定性降级不得调用模型：

- `text`：提取第一段非空文本，规范化空白并做显示长度截断；
- `code`：显示语言或工具名，例如“Codex 输出了一段 TypeScript 代码”；
- `command`：显示首行命令；命令失败时同时显示失败状态；
- `image`：显示“发送了一张图片”，并保留内容详情；
- `streaming`：使用“正在输出…”等进行中状态，不声称已经完成；
- 空内容：使用角色和状态生成“工具执行完成”“消息发送失败”等保守文案。

### 6.2 必须直接显示的信息

以下事件的紧凑态必须包含原因或所需动作，不能只显示标题：

- `failed` 或 severity 为 `error`；
- `blocked`、`waiting`、`need-input`；
- `approval-required`；
- 存在 danger action；
- 内容无法解析但事件声称需要用户处理。

若生产者没有提供原因，界面明确显示“未提供失败原因”或“需要处理，但未提供操作说明”，不得自行补写原因。

## 7. 界面设计

### 7.1 Activity / Attention 双视图

现有 Action Center 演进为统一事件面板，使用两个 tab：

- **Activity**：展示结构化 conversation message 与 hook event，按时间倒序；
- **Attention**：只展示 `attentionRequired === true` 的项目，并保留现有 actions。

默认 tab 规则：

- 用户主动打开面板时进入 Activity；
- 从等待确认、失败或危险 Toast 进入时定位到 Attention 对应项目。

### 7.2 紧凑态

每个项目默认显示：

- 主标题或发送角色；
- 一段摘要；
- 状态标记；
- 可靠存在时显示少量统计，例如文件数、测试数、耗时；
- 主操作按钮，仅在需要处理时直接显示。

成功项目不自动展开。失败和待处理项目仍保持紧凑布局，但原因与下一步必须可见。

### 7.3 展开态

点击项目的展开控件后显示：

- 完整正文；
- code、command、details 分块；
- 工具名、session、时间和父消息关系；
- 原始结构化 metadata；
- 次要操作。

展开状态仅为客户端 UI 状态，不写回 timeline。列表刷新时，以稳定事件 `id` 保持当前会话内的展开状态。

### 7.4 Action 与目标安全

Action 的有效 target 按以下顺序解析：

1. `action.target`；
2. event 顶层 `target`；
3. 不再回退到来源页面、当前 session 或自由文本中的 sessionName。

只有 target 含合法且当前存在的 `sessionName` 时，发送输入类 action 才可用。`input === null` 且 `open === false` 的 action 禁用；`open === true` 可以只执行导航。仅含 `projectName` 且 `view === "kanban"` 的 target 可用于导航，但不能发送 input。重复 action id 的所有冲突项均丢弃；空 id、未知 style、非法 target 在规范化时丢弃并记录诊断，不渲染按钮。

Danger action 不作为默认主按钮，必须显示危险样式；本阶段不新增二次确认，沿用现有显式点击语义。Action target 与 event target 冲突时以 `action.target` 为准，并在展开详情中显示实际目标。目标 session 已消失时按钮禁用并显示“目标会话不可用”，不得向当前 session 猜测发送。

组合 action 的执行顺序固定：若 `input !== null`，先验证目标并发送 input；发送成功后才在 `open === true` 时导航，失败则保持当前页面并显示错误。若 `input === null && open === true`，只导航。导航 target 可为 terminal session 或有效的 Kanban project/view。

“当前存在”采用双重校验：客户端 session registry 仅用于提前禁用和提示；发送 input 时服务端再次解析并验证目标 session。目标不存在或已退出返回 `404 target_session_not_found`，目标状态不允许输入返回 `409 target_session_unavailable`。客户端收到这两类响应后刷新 session 状态、保持事件未处理并更新按钮提示，不尝试其他 session。

### 7.5 Toast

Toast 只用于新到达且具有明确价值的信息：

- Attention 事件必须提示；
- 普通 `complete` 更新可按频率合并或不弹 Toast，只在 Activity 中记录；
- Toast 显示 title、summary、status 和最多两个主要 action；
- “查看详情”打开统一面板并定位到该事件，不在 Toast 内铺开长正文。

### 7.6 父子消息

存在 `parentMessageId` 时，tool message 在 Activity 中归入父 assistant message：

- 父项紧凑态显示“包含 N 个工具步骤”；
- 默认折叠成功的 tool 子项；
- 失败或待处理的子项自动提升为可见，并使父项进入 Attention；
- 找不到父消息时，子项作为独立项目显示，不丢弃。

## 8. 数据流与状态更新

1. 生产者调用 `POST /api/conversation/messages` 或 `POST /api/hooks/events`。
2. 服务端规范化 payload；conversation 按逻辑键 upsert，hook 追加写入 typed timeline record。
3. 服务端广播刚写入或更新后的同一 canonical record 到 `/ws/events`。
4. 客户端以事件 `id` 更新本地 timeline，优先增量合并；必要时再拉取历史。
5. presentation adapter 生成统一项目。
6. Activity、Attention 和 Toast 从同一项目集合派生。

`streaming` 消息通过 `(sessionName, messageId)` 定位服务端 record，但客户端始终使用稳定的 record `id` 更新同一展示项。终态不可回退；迟到的 streaming 或冲突终态返回 `409`，不得产生新卡片或广播。相同终态的完全相同重试为幂等成功。

## 9. 兼容性与错误处理

- 缺少 `summary`：使用确定性降级规则。
- 非法 `summary` 或 metadata：服务端忽略非法可选字段；核心字段仍按现有验证返回错误。
- 旧 Hook Event：继续按 `content → body → title` 读取。
- 未知 content type：完整内容放入详情，摘要显示“收到不支持的内容类型”。
- websocket 重连：以 timeline 为准恢复，不依赖仅存在于 Toast 的状态。
- 超长正文：DOM 中按需创建或渲染详情，避免所有折叠正文同时进入布局；服务端长度上限保持生效。
- 无障碍：展开控件使用原生 `button`/`details` 或正确的 `aria-expanded`；状态不只依赖颜色。

### 9.1 兼容矩阵

| 消费者 / 数据 | 兼容策略 |
| --- | --- |
| 旧 conversation POST 客户端 | 兼容不带 `summary`/`revision` 的单次 create，服务端输出 `summary: null`、`revision: 1`；旧 streaming producer 的重复更新不兼容，必须升级为显式 revision 契约 |
| 宽松 JSON / TypeScript 客户端 | 接受新增 `summary`、必需的 `revision`、`updatedAt` 与 typed hook 字段 |
| 严格 decoder 的原生客户端 | 在发布前更新 schema 接受新增字段（包括必需输出 `revision`）；未更新客户端继续使用旧版本服务端，不承诺忽略未知字段 |
| 旧 hook timeline history | 客户端 legacy adapter 从 BaseTimelineEvent metadata 读取；不迁移已有内存历史 |
| 新 hook history/realtime | 统一使用 `HookEventTimelineEvent`；同一 `id` 和 `createdAt`；兼容期 dual-write legacy metadata 投影 |
| UI 回退 | 可关闭新 Activity/Attention 入口；旧 UI 继续读取 dual-write metadata，服务端无需回退 |

本次不提升 `/ws/events` envelope 版本；新增 union member 的字段为向后扩展。若原生客户端存在严格 union decoder，Phase 1 发布门禁要求先完成对应客户端兼容验证。

Phase 1 可以独立合并，但服务端发布存在明确前置门禁：所有已登记的严格 decoder 原生客户端必须先发布能接受 `summary`、必需输出 `revision`、`updatedAt` 与 typed hook record 的版本；所有会对同一 `messageId` 发送多次更新的 streaming producer 必须先升级为显式递增 revision。发布清单记录各消费者最低兼容版本；未满足门禁时 Phase 1 只进入代码主干和测试环境，不发布生产服务端。

## 10. 分阶段开发

### Phase 1：契约与统一摘要模型

范围：

- 为 conversation message 增加可选 `summary` 并更新 API 文档；
- 增加 conversation upsert、逻辑键、状态机和幂等/冲突规则；
- 增加 producer revision 并拒绝迟到、重复冲突和跳号更新；
- 增加 typed `HookEventTimelineEvent`，保证两类事件的 timeline 与 `/ws/events` identity 和 payload 一致；
- 在兼容窗口 dual-write 旧 UI 所需的 hook metadata 投影，并用结构守卫读取 typed/legacy history；
- 实现纯函数 presentation adapter；
- 固定摘要优先级、状态映射、降级文案、attention 判定、action target 解析和详情分块。

验收：

- 新旧 payload 均可写入并实时广播；
- history 与 realtime 对同一记录生成完全一致的 presentation item；
- streaming 更新保持相同 record `id`，终态回退和冲突终态返回 `409`；
- `failed`、`waiting`、`approval-required` 不会生成模糊成功摘要；
- adapter 单元测试覆盖 conversation/hook、状态映射、target 冲突、空内容、非法可选字段和旧事件。

交付价值：后续所有 UI 使用稳定模型，不再各自猜测数据含义。

### Phase 2：Activity 摘要流

范围：

- 在统一面板中增加 Activity tab；
- 渲染 conversation message 和全部结构化 hook；
- 实现 B 模式紧凑态与完整详情展开；
- 用事件 `id` 保持展开状态；
- 支持 loading、empty、reconnect 和历史刷新状态。

验收：

- 用户能看到结构化消息，而不是仅触发静默刷新；
- 默认列表只显示主要内容；点击后能看到完整正文与原始详情；
- 桌面和移动端均无内容溢出或控件重叠；
- 旧事件在无 summary 时仍有可理解的紧凑态。

交付价值：首次形成可日常使用的结构化信息流。

### Phase 3：Attention 与准确操作

范围：

- 将现有 Action Center 行为迁移到 Attention tab；
- 修正 actionable hook 的来源、标题、原因和 action 映射；
- Toast 统一使用 presentation item；
- Attention Toast 可定位到具体事件；
- 普通完成事件降噪，避免每条都弹出。

验收：

- approval、waiting、blocked、need-input、failed 均可靠进入 Attention；
- 所有按钮作用于事件声明的 target session；
- 无 target 或 action 不完整时显示明确不可用状态，不发送猜测输入；
- 普通 Activity 不会挤占需要处理的信息。

交付价值：解决现有 Action Center “几乎没用或不准确”的核心问题。

### Phase 4：消息关联、性能与体验收口

范围：

- 按 `parentMessageId` 折叠 tool 子步骤；
- streaming 更新的渲染节流与视觉稳定性；基础原位 upsert 和最终状态收敛已在 Phase 1 完成；
- 大量事件的增量渲染、分页或窗口化；
- 增加 cursor-based timeline pagination，并将可配置 retention 提升到至少 1,000 条；默认首屏仍保持小批量读取；
- 按真实使用反馈调整摘要长度、默认展开和 Toast 频率；
- 完成 API 示例、生产者接入指南和升级说明。

验收：

- 父子消息不重复、不丢失，失败子项能够提升；
- 在 10 次/秒、持续 30 秒更新同一 streaming message 的基准中只保留一个展示项，主列表 DOM 节点数不随更新次数增长；
- 在 1,000 条服务端历史记录、其中 100 条 tool 子项的数据集中，可通过 cursor 分页完整访问；首次打开只请求首批数据，滚动过程中不一次性渲染超过 200 个事件项；
- 性能预算使用项目 Playwright Chromium 和固定 fixture：1,000 条记录、100 个 tool 子项、20 个 Attention、每条 160 字符 summary、每十条包含 8 KiB details。Phase 2 开始前在其父提交上用同一脚本和同一 CI runner 记录基线 artifact；变更后运行 5 次 warm run 取中位数。计时从点击入口的 `performance.mark` 到面板根节点完成首批渲染并可响应测试点击；结果不超过基线的 1.25 倍且绝对值不超过 300 ms。DOM“事件项”指带稳定 event id 的顶层或当前展开子项元素，不计内部文本/details 节点；
- 在 390x844、768x1024、1440x900 三种 viewport 下无横向页面溢出，长命令和 2 KiB 单词串限制在详情滚动区；
- 文档可指导旧生产者逐步补充高质量 summary。

交付价值：从可用版本提升为稳定、可扩展的信息呈现系统。

Phase 4 的分页 wire contract 固定为 `GET /api/timeline?limit=<n>&cursor=<opaque>`，响应 `{ events, nextCursor }`。结果按 `(createdAt, id)` 降序；无 cursor 的请求读取调用时最新一页，后续 cursor 只遍历该边界之前的更旧记录，因此分页期间插入的新事件不会造成重复或跳页。同一 cursor 在 retention 未变化时返回一致结果。cursor 是服务端生成的不透明字符串，内部绑定稳定的 `(createdAt, id)` 边界，客户端不得解析。格式非法返回 `400`；对应边界已因 retention 淘汰返回 `410`，客户端提示历史已过期并从首批重新加载。retention 使用 `TMUX_UI_TIMELINE_MAX_EVENTS` 配置，Phase 4 默认值为 `1000`，服务端仍对单页 `limit` 设置上限。

## 11. 测试策略

- **共享类型与服务端**：payload 规范化、长度限制、timeline identity、websocket payload、旧请求兼容。
- **纯函数 adapter**：摘要优先级、各 content type、状态映射、attention 判定、详情保留、未知字段。
- **组件测试**：Activity/Attention tab、紧凑与展开、action 状态、父子项目、无障碍属性。
- **集成测试**：POST message/hook 后历史与实时界面一致；streaming 到最终状态不重复。
- **视觉与交互验证**：桌面、窄屏手机、长单词、长命令、代码块、错误原因和多 action 场景。
- **回归测试**：终端 websocket、PTY 渲染、现有 Kanban、session 操作和旧 Hook Event 行为不受影响。

每个 phase 单独运行完整 `npm test` 与 `npm run build`。Phase 2 起增加浏览器交互与响应式截图验证。

## 12. 发布与观测

- 每个 phase 独立合并和发布，不等待全部阶段完成。
- 记录收到的 conversation/hook 数量、缺少生产者 summary 的比例、降级摘要类型和 Attention 数量；不得记录超出既有边界的正文内容。
- 若新 UI 出现问题，可回退展示入口；timeline 数据契约保持向后兼容，无需迁移或删除历史。

## 13. 完成标准

- 在 390x844 viewport 的默认折叠态至少完整显示 3 条普通 Activity，且 Attention 原因与主要 action 不被截断；
- 展开项目后，无需额外网络请求即可发现并访问所有完整内容；code/details 可以保留内部折叠层级。
- Action Center/Attention 的事件来源和操作目标可由结构化字段解释并由测试验证。
- 同一事件在历史、实时、Toast 和面板中不会出现相互矛盾的标题、状态或摘要。
- 原始终端通道保持独立，不承担结构化消息推断职责。
