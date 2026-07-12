# tmux-ui

[English](README.md)

tmux-ui 是一个轻量的浏览器 tmux 控制台。它可以列出 tmux session、在浏览器中打开终端 tab、创建 session、配置每个 session 的终端渲染选项，并在界面中关闭 session。

## 环境要求

- 源码开发需要 Node.js/npm，并且 `tmux` 在 `PATH` 中可用。
- 使用打包后的 `.run install` 时，如果宿主机没有 Node，会自动安装 nvm
  并通过 nvm 安装 Node 22；如果没有 `tmux`，会通过 Homebrew、apt、
  dnf、yum、apk 或 pacman 自动安装。

## 常用脚本

- `npm run dev:server` 启动服务端 watch 模式
- `npm run dev:client` 启动 Vite 客户端开发服务
- `npm run build` 构建服务端和客户端产物
- `npm run pack:run` 在 `release/` 下生成独立 `.run` 安装包
- `npm run publish` 上传已有的 `release/release.run` 到指定服务器
- `npm run release:notes` 生成中英双语 release notes
- `npm run start` 运行已构建的服务端
- `npm run test` 运行测试

## API 参考

第三方工具可以通过可信的 Tailscale/内网直接调用 tmux-ui。完整 HTTP 和
WebSocket API 列表、请求体和返回数据结构见 [docs/api.md](docs/api.md)。

常用 project API 入口：

- `GET /api/kanban/projects` 列出已配置的项目组。
- `POST /api/kanban/projects` 创建或更新项目，并可启动选中的 agent session。
- `POST /api/kanban/projects/:name/sessions` 把已有 tmux session 加入项目。
- `POST /api/kanban/projects/:name/messages` 向项目内 session 发送 task 或
  report。

## 安装

```bash
npm install
```

## 本地运行

最简单的本地运行方式：

```bash
npm run build
npm run start
```

开发环境的 `npm run start` 仍然遵循当前环境变量。使用打包后的 `.run`
安装时，tmux-ui 默认会自动绑定到第一个 `100.*` Tailscale IP；如果没有
找到，则回退到 `127.0.0.1`。如果要指定某个内网地址，可以显式设置：

```bash
HOST=100.x.y.z npm run start
```

`HOST=0.0.0.0` 会被拒绝，避免误把终端控制能力暴露到非预期网络。

开发时也可以拆分运行：

```bash
npm run dev:server
npm run dev:client
```

## Run 文件

构建独立 run 文件：

```bash
npm version patch --no-git-tag-version
npm run pack:run
```

会生成：

- `release/release.run`：稳定文件名，适合本地发布或上传服务器
- `release/tmux-ui-<version>.run`：带版本号的产物，适合 GitHub Release

发布前预览 release notes：

```bash
npm run release:notes
npm run release:notes -- --out release/release-notes.md --zh-out release/release-notes.zh-CN.md
```

release notes 会从上一个 `v<version>` tag 到当前构建之间列出所有提交，并按功能区域分组。默认控制台输出包含英文和中文；需要单独中文文件时使用 `--zh-out`。

run 文件默认安装到 `~/.tmux-ui`：

```bash
./release/release.run help
./release/release.run install
./release/release.run start
./release/release.run restart
./release/release.run service-install
./release/release.run uninstall
```

每次准备发布的构建都应该先提升 patch 版本。dashboard 和 `/api/health` 会暴露 `version`、`commit`、`builtAt`，方便判断当前运行版本是否最新：

```bash
curl -s http://<host>:3000/api/health
```

直接从最新 GitHub Release 安装或更新：

```bash
curl -fsSL https://github.com/neatstudio/tmux-browser/releases/latest/download/install.sh | sh
```

这个 bootstrap 安装器会下载最新的 `release.run`，安装并重启 tmux-ui。首次安装和旧版本更新都可以用同一条命令。如果要安装或更新为服务模式：

```bash
curl -fsSL https://github.com/neatstudio/tmux-browser/releases/latest/download/install.sh | sh -s -- --service
```

只安装、不启动服务：

```bash
curl -fsSL https://github.com/neatstudio/tmux-browser/releases/latest/download/install.sh | sh -s -- --install-only
```

如果需要直接调用底层 run-file 命令，可以把命令放在 `--` 后面：

```bash
curl -fsSL https://github.com/neatstudio/tmux-browser/releases/latest/download/install.sh | sh -s -- -- service-status
```

也可以手动从 GitHub Release 下载并运行：

```bash
curl -L -o tmux.run https://github.com/neatstudio/tmux-browser/releases/latest/download/release.run
chmod +x tmux.run
./tmux.run help
./tmux.run install
```

`./tmux.run` 是首次下载用的 bootstrap 文件。执行 `install` 时，tmux-ui
会把 run 文件复制到 `~/.tmux-ui/bin/tmux-ui`，并优先软链到
`~/.local/bin/tmux-ui`。如果 `~/.local/bin` 不可写，会尝试
`/usr/local/bin`。如果选择的 bin 目录不在 `PATH` 中，安装器会写入常见
shell profile。

安装完成后，使用稳定命令 `tmux-ui`：

```bash
tmux-ui help
tmux-ui start
tmux-ui restart
tmux-ui stop
tmux-ui upgrade
tmux-ui uninstall
```

如果当前 shell 仍然提示 `tmux-ui: command not found`，重开 shell，或者执行安装器输出的 `source ...` 命令。临时只在当前 shell 生效，可以运行：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

如果在 tmux 外执行 `start`，脚本会自动把 tmux-ui 放进专用的 `tmux-ui` tmux session 中运行，避免关闭终端后服务退出。如果已经在 tmux 内，`start` 会在当前 pane 前台运行。

长期运行建议使用：

```bash
tmux-ui restart
```

这会解压应用到 `~/.tmux-ui`，按需安装生产依赖，并在专用 tmux session `tmux-ui` 中启动服务。停止或移除：

```bash
tmux-ui stop
tmux-ui uninstall
```

使用 `tmux-ui upgrade` 可以下载最新 GitHub Release 的 `release.run` 并原地升级。如果当前是服务模式安装，`upgrade` 会保留服务模式并通过 service install/restart 更新；否则会执行 `install` 和 `restart`。

## 服务模式

Linux/systemd 服务器如果不想依赖一个 keeper tmux session，可以使用服务模式：

```bash
tmux-ui service-install
tmux-ui service-status
tmux-ui service-start
tmux-ui service-restart
tmux-ui service-stop
tmux-ui service-uninstall
```

默认 unit 文件是 `/etc/systemd/system/tmux-ui.service`。可以用 `TMUX_UI_SERVICE_NAME` 修改服务名，或用 `TMUX_UI_SYSTEMD_UNIT` 指定 unit 路径。

如果已经安装过服务，可以用系统命令查看服务是否存在、是否正在运行，以及启动/停止服务：

```bash
systemctl status tmux-ui
systemctl is-enabled tmux-ui
systemctl is-active tmux-ui
journalctl -u tmux-ui -n 100 --no-pager
systemctl start tmux-ui
systemctl restart tmux-ui
systemctl stop tmux-ui
```

macOS 本地同样使用 service 命令安装用户级 launchd 服务：

```bash
tmux-ui service-install
tmux-ui service-status
tmux-ui service-start
tmux-ui service-restart
tmux-ui service-stop
tmux-ui service-uninstall
```

默认 plist 是 `~/Library/LaunchAgents/com.neatstudio.tmux-ui.plist`。日志写入：

```text
~/.tmux-ui/tmux-ui.log
~/.tmux-ui/tmux-ui.err.log
```

如果已经安装过服务，可以用 launchd 命令查看和操作：

```bash
launchctl print "gui/$(id -u)/com.neatstudio.tmux-ui"
launchctl kickstart -k "gui/$(id -u)/com.neatstudio.tmux-ui"
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.neatstudio.tmux-ui.plist"
tail -n 100 ~/.tmux-ui/tmux-ui.log
tail -n 100 ~/.tmux-ui/tmux-ui.err.log
```

## 网络绑定

`.run` 安装默认会自动绑定到第一个 `100.*` Tailscale IP；如果没有找到，
则回退到 `127.0.0.1`。如果要手动指定监听地址或端口，请使用明确的内网
IP；`HOST=0.0.0.0` 会被拒绝：

```bash
HOST=100.x.y.z PORT=3000 ./release/release.run start
```

## 发布到服务器

上传已有 run 文件到一个或多个服务器：

```bash
npm run publish -- --target server-a:/root/tmux --install --restart
```

如果没有传 `--target`，`publish` 会读取 `.tmux-ui.publish.json`。该文件被 Git 忽略，用来保存私有服务器名称。
可以复制 `.tmux-ui.publish.json.example` 作为本机多服务器发布配置：

```bash
cp .tmux-ui.publish.json.example .tmux-ui.publish.json
```

publish 目标必须是当前机器可以直接 SSH 的 Host。也就是说，目标里的主机名必须能在本机 `~/.ssh/config` 中解析，或者能通过系统默认 SSH hostname 解析。比如 `server-a:/root/tmux` 要求下面的命令先能正常连接：

```bash
ssh server-a
```

在 GitHub 上 push 到 `main` 时，如果 `v<package.json version>` tag 不存在，workflow 会创建对应 GitHub Release，上传 `install.sh`、`release.run` 和带版本号的 run 文件，并使用自动生成的详细 release notes。

## Kanban 项目

打开 `/?view=kanban` 可以创建基于项目的 agent session。一个项目包含项目名、路径、可选 SSH 服务器，以及 `claude`、`codex`、`kiro` 等 agent。每个 agent 会得到稳定的 tmux session 名：`<project>-<agent>`。

本机项目会直接在项目路径下创建 agent session，并按配置启动命令。远程项目会先在本机创建同名 wrapper session；这个 wrapper session 会 SSH 到远程服务器，并 attach 或创建远程同名 tmux session。这样浏览器仍然能从本机 tmux-ui 打开稳定 session，同时远程 agent 也有固定名称用于 resume。

第三方工具也可以直接调用同一套 project API：用 `POST /api/kanban/projects`
创建项目，用 `POST /api/kanban/projects/:name/sessions` 绑定已有 session，
用 `POST /api/kanban/projects/:name/messages` 发送项目级 task 或 report。
请求体和返回结构见 [docs/api.md#kanban-projects-project-apis](docs/api.md#kanban-projects-project-apis)。

## Agent Hook 事件

tmux-ui 支持接收 Codex、Claude 或其他 agent hook 主动上报的事件。相比扫描终端画面，hook 更适合上报等待确认、任务阻塞、命令失败等明确状态。

来自 `127.0.0.1`、`::1` 或 Tailscale `100.64.0.0/10` 的 hook 请求可以免 token，但判断依据是真实 socket 地址；只有显式配置 trusted proxy 时，才会使用 Express 解析后的代理地址。直接请求不能通过伪造 `X-Forwarded-For` 绕过鉴权。其他来源需要 token；如果你希望所有环境都显式保护，仍建议设置 token：

```bash
export TMUX_UI_HOOK_TOKEN='change-me'
tmux-ui restart
```

安装 Codex/Claude hook：

```bash
tmux-ui hooks-install
```

卸载 tmux-ui 安装的 hook：

```bash
tmux-ui hooks-uninstall
```

`hooks-install` 会合并写入 `~/.codex/hooks.json` 的 `PermissionRequest` 和 `~/.claude/settings.json` 的 `Notification(permission_prompt|idle_prompt)`，不会覆盖已有 hook。安装的 adapter 会输出标准 `tmux-ui.hook/v1` 事件，后续增加 opencode、kimi、qwecn、qodercli 等工具时，只需要新增安装适配器，不需要改 UI。

标准 hook 事件可以带跨 group target、适合移动端的结构化内容和明确按钮。
Toast 会优先显示 `summary`，Action Center 会把占空间的 `code` 和
`details` 折叠起来：

```json
{
  "schemaVersion": "tmux-ui.hook/v1",
  "source": "codex",
  "sessionName": "project-codex",
  "eventType": "approval-required",
  "status": "waiting",
  "title": "Need confirmation",
  "body": "Approve file edit?",
  "content": [
    { "type": "summary", "text": "Two files changed; approve patch?" },
    {
      "type": "code",
      "title": "src/app.ts",
      "language": "ts",
      "text": "export const answer = 42;",
      "collapsed": true
    }
  ],
  "target": {
    "sessionName": "project-codex",
    "projectName": "project",
    "view": "terminal"
  },
  "actions": [
    { "id": "approve", "label": "Approve", "input": "y\r", "style": "primary" },
    { "id": "deny", "label": "Deny", "input": "n\r", "style": "danger" },
    { "id": "open", "label": "Open", "open": true }
  ]
}
```

如果要手动在其他工具 hook 中调用：

```bash
echo "Approve file edit?" | \
  TMUX_UI_HOOK_SOURCE=codex \
  TMUX_UI_HOOK_EVENT_TYPE=approval-required \
  TMUX_UI_HOOK_STATUS=waiting \
  TMUX_UI_HOOK_TITLE='Need confirmation' \
  TMUX_UI_HOOK_TARGET_PROJECT=project \
  TMUX_UI_HOOK_ACTIONS_JSON='[{"id":"approve","label":"Approve","input":"y\r","style":"primary"}]' \
  ~/.tmux-ui/bin/tmux-ui-hook
```

脚本会优先从当前 tmux 环境推断 session 名，也可以显式传入 `TMUX_UI_SESSION_NAME=<session>`。服务端会写入 timeline，并通过全局 websocket 推送到 Action Center；`waiting`、`blocked`、`need-input`、`failed` 会作为重要 action 显示。

如果服务没有监听 `127.0.0.1:3000`，在 hook 环境里额外设置 `TMUX_UI_HOOK_URL=http://100.x.y.z:3000/api/hooks/events`。

## tmux 恢复

tmux-ui 可以选择性安装并管理 `tmux-resurrect` 和 `tmux-continuum`，用于在服务器重启或异常退出后恢复 tmux session。它不会放进默认 `install`，因为这个操作会修改 `~/.tmux.conf`、在 `~/.tmux/plugins` 下安装 TPM 插件，并且安装插件时需要访问 GitHub。

```bash
tmux-ui tmux-install
tmux-ui tmux-status
tmux-ui tmux-save
tmux-ui tmux-restore
tmux-ui tmux-update
```

安装后会增加：

- `~/.tmux/plugins/tpm`
- `tmux-resurrect` 和 `tmux-continuum`
- `~/.tmux.conf` 中的一段受管理配置
- 每 15 分钟自动保存 tmux 状态
- tmux 启动时自动恢复
- 手动保存：先按 `Ctrl-b`，再按 `Ctrl-s`
- 手动恢复：先按 `Ctrl-b`，再按 `Ctrl-r`

安装 tmux 恢复能力后，tmux-ui 在启动服务前也会尝试安全自动恢复：只有当前 tmux 没有任何 session 时才会恢复。设置 `TMUX_UI_TMUX_AUTO_RESTORE=0` 可以关闭这个行为。

注意事项：tmux-resurrect 不能恢复进程内存状态。它可以恢复 session、window、pane、布局、当前目录、pane 内容，并重启部分命令；但如果某个进程执行到一半被中断，它必须自己支持 resume/checkpoint 才能继续。

## 图片上传

在 terminal session 页面中，可以直接粘贴或拖入图片。tmux-ui 会把图片上传到服务器，并把保存后的绝对路径插入当前 tmux 输入行，不会自动按 Enter。

上传文件保存位置：

```text
~/.tmux-ui/uploads/<session-name>/
```

服务端按图片 magic bytes 判断真实类型，而不是只相信文件名或浏览器 MIME。支持 PNG、JPEG、GIF、WebP，单文件上限 10MB。上传时会自动清理旧文件；默认保留 7 天，总上传目录预算 1GB。

## tmux 生命周期规则

- dashboard 的 session 列表来自真实的 `tmux list-sessions`
- 打开浏览器 tab 会 attach 到 tmux session
- 关闭浏览器 tab 不会 kill tmux session
- 刷新或关闭浏览器不影响 tmux session
- dashboard 中点击 `Kill` 会执行 `tmux kill-session -t <name>`
- session 页面内点击 `Kill` 会先确认，避免误杀
- 如果某个 session 正在浏览器 tab 中打开，且该 session 被 kill，对应的浏览器终端视图会关闭
