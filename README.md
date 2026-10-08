# 逃离绝命岛 Web 版

把《Survive The Island》（《逃离绝命岛》2024 版）改编为可通过浏览器联机游玩的 3D 桌游。

当前已完成首个可运行的 3D 联机竖切，支持创建房间、真人座位、观战、服务端 AI、基础探险者移动、岛屿沉没、救援计分和火山终局。

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

## 当前状态

- Git 仓库默认分支为 `main`
- 规则基线为 2024 版官方英文规则
- 首个多人 3D 竖切已经可运行
- 完整木筏、生物、能力牌和正式 AI 美术/音频资产仍在后续里程碑

## 知识产权说明

原作名称、规则书文字、插画、角色造型、图标、版图和音频等可能受版权或商标保护。本项目应使用原创名称与原创视听资产；若计划公开传播、收费或商业运营，应先取得权利方授权。
