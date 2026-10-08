# 美术与音频方案

## 1. 原创视觉资产

最终资产不复刻原作插画或模型，保留“沉没岛屿逃生桌游”的玩法表达，建立独立世界观与美术识别。

建议资产清单：

- 3 套六边地形模块：海滩、森林、山地，每套 4 至 6 个变体。
- 4 个救援岛与中央海域版图。
- 5 种玩家颜色的探险者，每色可共享网格并换材质。
- 木筏、海蛇、鲨鱼、巨兽、火山、漩涡。
- 水花、泡沫、裂缝、火山灰、冲击波等特效贴图。
- 房间封面、加载图、能力图标和规则示意图。

### AI 生产流程

1. 用图像模型生成原创概念图和正交参考图。
2. 选定统一造型语言、比例、材质和色板。
3. 使用文本/图片转 3D 服务生成基础网格，或依据参考图人工建模。
4. 在 Blender 中清理拓扑、减面、UV、骨骼和碰撞代理。
5. 导出 GLB，压缩纹理与网格并进入游戏检查。
6. 每项资产保存提示词、seed、模型版本、许可证和人工修改记录。

当前环境可直接调用图像生成工具制作概念图与纹理参考。3D 生成建议预留 Meshy/Tripo 一类 API 适配层，实际使用前根据账号、预算和授权条款选定供应商。

### 概念图提示词模板

```text
Original stylized tabletop survival-adventure game asset, [ASSET],
handcrafted miniature diorama, readable chunky silhouette, playful danger,
tropical island materials, painted resin and wood, bright natural colors,
consistent 3/4 isometric view, studio neutral background, production concept art,
no text, no logo, no copyrighted characters, no board-game box art
```

### 3D 生成提示词模板

```text
Game-ready stylized low-poly [ASSET], strong clean silhouette,
hand-painted PBR materials, modular tabletop miniature style,
front/side/back forms fully defined, watertight mesh, minimal thin parts,
single object centered at world origin, neutral pose, no base, no text,
target 8k-20k triangles, suitable for GLB export and real-time web rendering
```

正式生产时会为每个资产单独编写提示词，不用一个模板硬套全部对象。

## 2. 音乐设计

建议制作 4 条可无缝循环的分层 BGM：

| 场景 | 长度 | 氛围 |
| --- | --- | --- |
| 房间/设置 | 90–120 秒 | 轻快、好奇、木质打击乐 |
| 前期探索 | 120–180 秒 | 热带冒险，节奏克制 |
| 岛屿崩坏 | 120–180 秒 | 更强鼓点、低音脉冲、危险感 |
| 终局火山 | 60–120 秒 | 紧张但不恐怖，结尾可自然截断 |

音乐不应包含人声，避免长时间游玩产生疲劳；旋律层、节奏层和危险层最好可以独立循环，由游戏状态动态混音。

### BGM 提示词模板

```text
Seamless looping instrumental soundtrack for an original stylized 3D tabletop
island survival game. Playful adventure with rising environmental danger,
marimba, hand percussion, plucked strings, warm woodwinds, subtle low drums,
clear rhythmic pulse but unobtrusive under conversation, no vocals, no choir,
no recognizable melody, no cinematic trailer hits, loop-safe ending,
[DURATION], [INTENSITY / GAME PHASE].
```

## 3. 音效设计

核心音效：

- UI：悬停、确认、取消、错误、轮到你、响应窗口。
- 棋盘：拿起/放下棋子、走路、游泳、登筏、划桨、获救。
- 环境：海浪、木筏吱呀、森林、山体震动。
- 灾难：地形开裂、沉没、漩涡、火山喷发。
- 生物：海蛇游动/攻击、鲨鱼鳍/扑击、巨兽脚步/咆哮/推开。
- 结果：得分、胜利、失败、平局。

### 音效提示词模板

```text
Clean isolated game sound effect: [EVENT].
Stylized family adventure tone, tactile tabletop miniature materials,
clear transient, short readable tail, no speech, no music, no ambience bed,
no distortion, suitable for layering in a browser game, [DURATION] seconds.
```

生成后要做去噪、裁切、响度统一、淡入淡出和循环点检查。浏览器交付优先使用 `webm/opus`，并准备 `mp3` 兼容版本。

## 4. AI 音频接入

音频生成工具在当前工作区尚未暴露为可直接调用的内置工具。实施阶段有两条路径：

- 若届时提供音频生成 API 凭证，接入供应商 API 批量生成并记录提示词与许可证。
- 若没有 API，先输出可直接投喂到 Stable Audio、ElevenLabs Sound Effects 等服务的逐资产提示词清单，再将用户选定结果纳入工程。

所有 AI 音频在发布前检查商用授权、相似性风险与服务条款；不要求模仿具体作曲家、影视作品或现有游戏音乐。

## 5. 运行时音频

- 使用 Web Audio API/Howler 管理 BGM、音效和空间衰减。
- 首次用户点击后解锁音频，记忆独立的主音量、BGM 和音效音量。
- 生物、火山、沉岛使用轻度空间音频；UI 与回合提示保持非空间化。
- 同类音效配置 3 至 5 个变体并轻微随机音高，降低重复感。
- 页面失焦时降低 BGM；轮到玩家时仍可播放一次可关闭的提示音。
