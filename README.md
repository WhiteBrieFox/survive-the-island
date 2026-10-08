# 逃离绝命岛 Web 版

把《Survive The Island》（《逃离绝命岛》2024 版）改编为可通过浏览器联机游玩的 3D 桌游。

当前提供可完整跑到终局的 3D 联机版本，支持 2 至 5 人、观战、两档服务端 AI、断线恢复、自动存档、木筏、生物、能力牌、原创 BGM 与音效。

## 启动

```bash
pnpm install
pnpm build
PORT=4173 pnpm start
```

浏览器打开 `http://本机IP:4173`。局域网中的朋友可直接使用该地址；跨公网需要将 TCP 4173 端口映射到这台电脑。

开发模式：

```bash
pnpm dev
```

前端开发地址为 `http://localhost:5173`，联机服务仍使用 4173。

## 文档

- [规则梳理](docs/rules.md)
- [技术方案](docs/technical-plan.md)
- [美术与音频方案](docs/asset-audio-plan.md)
- [待确认事项](docs/decisions.md)
- [实现状态](docs/implementation-status.md)
- [正式版验收标准](docs/production-acceptance.md)
- [AI 资产生成提示词](docs/generation-prompts.md)

生产模式必须先完成 `pnpm build`，再启动服务。重新构建后需重启生产进程。

## 当前状态

- Git 仓库默认分支为 `main`
- 规则基线为 2024 版官方英文规则
- 2024 版核心规则、完整回合流程和 2 至 5 人自动终局回归已接入
- 同一端口提供网页和 Socket.IO，可通过 IP 与映射端口邀请朋友
- 生产房间会保存到 `data/rooms.json`，玩家和观战者可凭本地令牌恢复
- 正式验收残余项记录在 [实现状态](docs/implementation-status.md)

## 知识产权说明

原作名称、规则书文字、插画、角色造型、图标、版图和音频等可能受版权或商标保护。本项目应使用原创名称与原创视听资产；若计划公开传播、收费或商业运营，应先取得权利方授权。
