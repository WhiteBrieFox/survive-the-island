# Mira 正交建模参考提示词

以下提示词用于指定 Mira 会话。每张图只生成一个资产的正交多视图，作为后续图生 3D 或 Blender 建模参考，不直接当作 3D 模型使用。

## 统一前缀

```text
Generate exactly one image directly without explanation.
Use case: stylized-concept.
Asset type: orthographic turnaround concept sheet for production 3D modeling in an original browser board game.
Visual language: premium handcrafted painted-resin tabletop miniature, bright cheerful tropical adventure, polished stylized realism, clean readable silhouette, family-friendly, original design.
Layout: front, left side, back, right side, and three-quarter views of the exact same design, evenly spaced, fully visible, consistent proportions and colors in every view, neutral A-pose or neutral creature pose.
Background: flat neutral light gray studio background, soft contact shadow only.
Constraints: no perspective distortion in orthographic views, no text, no labels, no watermark, no frame, no pedestal, no scenery, no cropped parts, no duplicate limbs, no accessories changing between views, no copyrighted character.
```

## 探险者

```text
Subject: a capable tropical expedition explorer miniature, adult, friendly determined face, practical sun hat, rolled-sleeve field shirt, shorts, hiking boots, compact backpack, rope and canteen. Slightly exaggerated head and hands for tabletop readability. The shirt and hat use one clean replaceable player-color material region; skin, leather and equipment colors remain neutral. Geometry must avoid thin fragile straps and be suitable for a 3k-6k triangle game model.
```

## 鲨鱼

```text
Subject: an original emerald reef shark creature, powerful rounded hydrodynamic body, broad readable dorsal and pectoral fins, pale belly, subtle turquoise markings, expressive but anatomically convincing eyes, closed mouth with a hint of teeth, dangerous but not gory. Clear continuous body volume suitable for rigging and a 4k-8k triangle swimming game model.
```

## 热带树木套装

```text
Subject: a modular set of three tropical island trees sharing one style: one curved coconut palm, one broad-leaf coastal tree, and one compact jungle tree. Each tree is shown separately with front, side, back and three-quarter consistency. Sculpted trunk bark, layered leaf clusters with real thickness, no paper-flat crossed planes, roots forming a stable base. Designed for instancing and a 1.5k-3k triangle model per tree.
```

## 海蛇

```text
Subject: an original crimson tropical sea serpent, long flexible S-shaped body, broad finned crest, ivory belly plates, amber eyes, compact fore-fins, clearly distinct from an eastern dragon, no wings and no whiskers. Neutral swimming pose suitable for a spline-like skeleton and a 6k-10k triangle game model.
```

## 巨兽

```text
Subject: an original cobalt amphibious island kaiju miniature, broad torso, powerful forearms, webbed feet, coral-like ivory brow horns, friendly readable proportions with imposing weight, no resemblance to an existing film monster. Neutral rigging pose suitable for walking, pushing and roaring animations.
```

## 木筏

```text
Subject: a handcrafted tropical survival raft made from lashed logs and weathered planks, clear deck space for exactly three explorer miniatures, two tied paddles, rope loops and a small rolled sail. Solid readable construction with no loose floating parts, suitable for a 2k-4k triangle game model.
```

## 使用方式

1. 每个主题分别提交，不要把人物、鲨鱼和树塞进同一张图。
2. 选定结果后锁定同一 seed 或参考图，再生成表情、材质和动画关键姿势。
3. 图生 3D 后仍需 Blender 清模、重拓扑、UV、LOD 与动画；不能直接把自动生成网格放进网页。
4. 最终 GLB 放入 `public/assets/models/`，源文件和许可证记录放在项目外的美术源文件目录。
