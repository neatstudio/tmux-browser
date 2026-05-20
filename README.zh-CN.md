# tmux-ui

[English](README.md)

tmux-ui 是一个轻量的浏览器 tmux 控制台。它可以列出 tmux session、在浏览器中打开终端 tab、创建 session、配置每个 session 的终端渲染选项，并在界面中关闭 session。

## 环境要求

- Node.js 20+
- npm 11+
- 已安装 `tmux`，并且 `tmux` 在 `PATH` 中可用

## 常用脚本

- `npm run dev:server` 启动服务端 watch 模式
- `npm run dev:client` 启动 Vite 客户端开发服务
- `npm run build` 构建服务端和客户端产物
- `npm run pack:run` 在 `release/` 下生成独立 `.run` 安装包
- `npm run publish` 上传已有的 `release/release.run` 到指定服务器
- `npm run release:notes` 生成中英双语 release notes
- `npm run start` 运行已构建的服务端
- `npm run test` 运行测试

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

默认会在 `http://0.0.0.0:3000` 提供 dashboard，因此可以通过局域网 IP、Tailscale IP 或 MagicDNS 访问。如果只想监听本机，使用：

```bash
HOST=127.0.0.1 npm run start
```

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

从 GitHub Release 下载并运行：

```bash
curl -L -o tmux.run https://github.com/neatstudio/tmux-browser/releases/latest/download/release.run
chmod +x tmux.run
./tmux.run help
./tmux.run install
./tmux.run start
```

如果在 tmux 外执行 `start`，脚本会自动把 tmux-ui 放进专用的 `tmux-ui` tmux session 中运行，避免关闭终端后服务退出。如果已经在 tmux 内，`start` 会在当前 pane 前台运行。

长期运行建议使用：

```bash
./tmux.run restart
```

这会解压应用到 `~/.tmux-ui`，按需安装生产依赖，并在专用 tmux session `tmux-ui` 中启动服务。停止或移除：

```bash
./tmux.run stop
./tmux.run uninstall
```

## 服务模式

Linux/systemd 服务器如果不想依赖一个 keeper tmux session，可以使用服务模式：

```bash
./tmux.run service-install
./tmux.run service-status
./tmux.run service-start
./tmux.run service-restart
./tmux.run service-stop
./tmux.run service-uninstall
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
./tmux.run service-install
./tmux.run service-status
./tmux.run service-start
./tmux.run service-restart
./tmux.run service-stop
./tmux.run service-uninstall
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

默认绑定到第一张 Tailscale IPv4 地址，也就是 `100.*`。如果要手动指定监听地址或端口：

```bash
HOST=0.0.0.0 PORT=3000 ./release/release.run start
```

## 发布到服务器

上传已有 run 文件到一个或多个服务器：

```bash
npm run publish -- --target tw0:/root/tmux --install --restart
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

在 GitHub 上 push 到 `main` 时，如果 `v<package.json version>` tag 不存在，workflow 会创建对应 GitHub Release，上传 `release.run` 和带版本号的 run 文件，并使用自动生成的详细 release notes。

## tmux 恢复

tmux-ui 可以选择性安装并管理 `tmux-resurrect` 和 `tmux-continuum`，用于在服务器重启或异常退出后恢复 tmux session。它不会放进默认 `install`，因为这个操作会修改 `~/.tmux.conf`、在 `~/.tmux/plugins` 下安装 TPM 插件，并且安装插件时需要访问 GitHub。

```bash
./tmux.run tmux-install
./tmux.run tmux-status
./tmux.run tmux-save
./tmux.run tmux-restore
./tmux.run tmux-update
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
