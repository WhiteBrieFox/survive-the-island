export type SoundCategory = "setup" | "movement" | "board" | "creature" | "reward" | "ui";

export type SoundId =
  | "player-joined"
  | "game-start"
  | "explorer-place"
  | "raft-place"
  | "ui-select"
  | "turn-start"
  | "rising-prompt"
  | "creature-prompt"
  | "explorer-step"
  | "swimmer-move"
  | "raft-move"
  | "raft-board"
  | "explorer-rescue"
  | "explorer-lost"
  | "tile-flip"
  | "tile-sink"
  | "raft-reveal"
  | "ability-draw"
  | "ability-use"
  | "repellent-ready"
  | "repellent-use"
  | "creature-die"
  | "creature-spawn"
  | "creature-skip"
  | "shark-move"
  | "shark-attack"
  | "serpent-move"
  | "serpent-attack"
  | "kaiju-move"
  | "kaiju-attack"
  | "unit-displaced"
  | "whirlpool"
  | "volcano"
  | "game-finish";

export type SoundDefinition = {
  id: SoundId;
  label: string;
  category: SoundCategory;
  description: string;
  duration: string;
  source: "Mixkit" | "Kenney CC0" | "Mixkit + Kenney CC0";
};

const mixkit = "/assets/audio/sfx-library/";
const kenney = "/assets/audio/sfx-library/";

type SoundLayer = {
  src: string;
  volume: number;
  delay?: number;
  playbackRate?: number;
  startAt?: number;
  stopAfter?: number;
};

const layers: Record<SoundId, SoundLayer[]> = {
  "player-joined": [
    { src: `${mixkit}ui-positive.mp3`, volume: 0.5, playbackRate: 1.06, stopAfter: 1.1 }
  ],
  "game-start": [
    { src: `${mixkit}ui-success.mp3`, volume: 0.55, playbackRate: 0.96, stopAfter: 1.8 },
    { src: `${mixkit}wooden-ship-sea.mp3`, volume: 0.2, startAt: 0.3, stopAfter: 1.8 }
  ],
  "explorer-place": [
    { src: `${kenney}impact-soft.ogg`, volume: 0.62 },
    { src: `${kenney}footstep-grass-a.ogg`, volume: 0.42, delay: 0.04 }
  ],
  "raft-place": [
    { src: `${kenney}impact-plank.ogg`, volume: 0.52 },
    { src: `${mixkit}sea-splash.mp3`, volume: 0.38, delay: 0.05, stopAfter: 0.72 }
  ],
  "ui-select": [
    { src: `${kenney}impact-light.ogg`, volume: 0.46, playbackRate: 1.28 }
  ],
  "turn-start": [
    { src: `${mixkit}ui-confirm.mp3`, volume: 0.48, playbackRate: 1.04, stopAfter: 0.9 }
  ],
  "rising-prompt": [
    { src: `${mixkit}whoosh.mp3`, volume: 0.34, playbackRate: 0.82, stopAfter: 0.55 },
    { src: `${kenney}impact-rock.ogg`, volume: 0.46, delay: 0.2 }
  ],
  "creature-prompt": [
    { src: `${kenney}impact-plank.ogg`, volume: 0.34 },
    { src: `${kenney}impact-light.ogg`, volume: 0.4, delay: 0.11 },
    { src: `${kenney}impact-soft.ogg`, volume: 0.5, delay: 0.22 }
  ],
  "explorer-step": [
    { src: `${kenney}footstep-grass-a.ogg`, volume: 0.62 },
    { src: `${kenney}footstep-grass-b.ogg`, volume: 0.52, delay: 0.13 }
  ],
  "swimmer-move": [
    { src: `${mixkit}swimming.mp3`, volume: 0.48, startAt: 0.4, stopAfter: 0.72 }
  ],
  "raft-move": [
    { src: `${mixkit}ship-hull-creak.mp3`, volume: 0.38, playbackRate: 1.06, stopAfter: 0.9 },
    { src: `${mixkit}sea-splash.mp3`, volume: 0.34, delay: 0.12, playbackRate: 0.92, stopAfter: 0.82 }
  ],
  "raft-board": [
    { src: `${kenney}footstep-wood.ogg`, volume: 0.58 },
    { src: `${kenney}impact-plank.ogg`, volume: 0.42, delay: 0.12 },
    { src: `${mixkit}water-splash.mp3`, volume: 0.24, delay: 0.03, stopAfter: 0.5 }
  ],
  "explorer-rescue": [
    { src: `${mixkit}ui-success.mp3`, volume: 0.58, stopAfter: 1.8 },
    { src: `${mixkit}sea-splash.mp3`, volume: 0.2, delay: 0.08, stopAfter: 0.7 }
  ],
  "explorer-lost": [
    { src: `${mixkit}jump-water.mp3`, volume: 0.52, playbackRate: 0.88, stopAfter: 1.05 },
    { src: `${kenney}impact-bell.ogg`, volume: 0.23, delay: 0.32, playbackRate: 0.72 }
  ],
  "tile-flip": [
    { src: `${mixkit}card-flick.mp3`, volume: 0.58, playbackRate: 0.88, stopAfter: 0.6 },
    { src: `${kenney}impact-soft.ogg`, volume: 0.28, delay: 0.16 }
  ],
  "tile-sink": [
    { src: `${kenney}impact-rock.ogg`, volume: 0.62 },
    { src: `${mixkit}rumble.mp3`, volume: 0.32, stopAfter: 1.2 },
    { src: `${mixkit}sea-splash.mp3`, volume: 0.48, delay: 0.26, stopAfter: 0.9 }
  ],
  "raft-reveal": [
    { src: `${mixkit}water-splash.mp3`, volume: 0.42, playbackRate: 0.88, stopAfter: 0.72 },
    { src: `${mixkit}wood-planks.mp3`, volume: 0.38, delay: 0.16, stopAfter: 0.62 },
    { src: `${mixkit}ui-positive.mp3`, volume: 0.24, delay: 0.36, stopAfter: 0.9 }
  ],
  "ability-draw": [
    { src: `${mixkit}card-flick.mp3`, volume: 0.46, playbackRate: 1.12, stopAfter: 0.52 },
    { src: `${mixkit}ui-positive.mp3`, volume: 0.3, delay: 0.18, playbackRate: 1.08, stopAfter: 0.86 }
  ],
  "ability-use": [
    { src: `${mixkit}card-place.mp3`, volume: 0.42, playbackRate: 1.1, stopAfter: 0.45 },
    { src: `${mixkit}magic-whoosh.mp3`, volume: 0.48, delay: 0.04, stopAfter: 0.9 }
  ],
  "repellent-ready": [
    { src: `${mixkit}ui-confirm.mp3`, volume: 0.4, playbackRate: 0.86, stopAfter: 0.75 },
    { src: `${mixkit}dragon-growl.mp3`, volume: 0.18, startAt: 0.2, stopAfter: 0.72 }
  ],
  "repellent-use": [
    { src: `${mixkit}whoosh.mp3`, volume: 0.5, playbackRate: 1.18, stopAfter: 0.62 },
    { src: `${mixkit}dragon-growl.mp3`, volume: 0.25, delay: 0.1, playbackRate: 1.2, stopAfter: 0.6 },
    { src: `${mixkit}ui-positive.mp3`, volume: 0.3, delay: 0.34, stopAfter: 0.8 }
  ],
  "creature-die": [
    { src: `${kenney}impact-plank.ogg`, volume: 0.38 },
    { src: `${kenney}impact-light.ogg`, volume: 0.4, delay: 0.1 },
    { src: `${kenney}impact-plank.ogg`, volume: 0.46, delay: 0.2, playbackRate: 1.12 },
    { src: `${kenney}impact-soft.ogg`, volume: 0.58, delay: 0.32 }
  ],
  "creature-spawn": [
    { src: `${mixkit}fish-water.mp3`, volume: 0.42, stopAfter: 0.72 },
    { src: `${mixkit}dragon-growl.mp3`, volume: 0.34, delay: 0.16, playbackRate: 0.78, stopAfter: 0.86 }
  ],
  "creature-skip": [
    { src: `${mixkit}whoosh.mp3`, volume: 0.28, playbackRate: 1.35, stopAfter: 0.42 },
    { src: `${kenney}impact-light.ogg`, volume: 0.28, delay: 0.18 }
  ],
  "shark-move": [
    { src: `${mixkit}fish-water.mp3`, volume: 0.48, playbackRate: 0.9, stopAfter: 0.66 },
    { src: `${mixkit}whoosh.mp3`, volume: 0.2, playbackRate: 0.82, stopAfter: 0.54 }
  ],
  "shark-attack": [
    { src: `${mixkit}whoosh.mp3`, volume: 0.4, playbackRate: 1.2, stopAfter: 0.42 },
    { src: `${kenney}impact-heavy.ogg`, volume: 0.64, delay: 0.18 },
    { src: `${mixkit}sea-splash.mp3`, volume: 0.55, delay: 0.2, stopAfter: 0.82 }
  ],
  "serpent-move": [
    { src: `${mixkit}swimming.mp3`, volume: 0.36, startAt: 0.25, playbackRate: 0.72, stopAfter: 0.92 },
    { src: `${mixkit}dragon-growl.mp3`, volume: 0.2, delay: 0.16, playbackRate: 1.24, stopAfter: 0.58 }
  ],
  "serpent-attack": [
    { src: `${mixkit}dragon-growl.mp3`, volume: 0.54, playbackRate: 0.9, stopAfter: 1.0 },
    { src: `${kenney}impact-heavy.ogg`, volume: 0.58, delay: 0.32 },
    { src: `${mixkit}jump-water.mp3`, volume: 0.5, delay: 0.3, stopAfter: 0.95 }
  ],
  "kaiju-move": [
    { src: `${mixkit}monster-step.mp3`, volume: 0.58, stopAfter: 0.86 },
    { src: `${mixkit}rumble.mp3`, volume: 0.3, startAt: 0.2, stopAfter: 0.9 }
  ],
  "kaiju-attack": [
    { src: `${mixkit}monster-roar.mp3`, volume: 0.48, playbackRate: 0.9, stopAfter: 1.2 },
    { src: `${kenney}impact-heavy.ogg`, volume: 0.72, delay: 0.32 },
    { src: `${mixkit}wood-planks.mp3`, volume: 0.52, delay: 0.4, stopAfter: 0.8 }
  ],
  "unit-displaced": [
    { src: `${mixkit}whoosh.mp3`, volume: 0.38, playbackRate: 1.28, stopAfter: 0.4 },
    { src: `${kenney}impact-soft.ogg`, volume: 0.52, delay: 0.22 }
  ],
  "whirlpool": [
    { src: `${mixkit}swimming.mp3`, volume: 0.48, playbackRate: 0.62, stopAfter: 1.5 },
    { src: `${mixkit}rumble.mp3`, volume: 0.34, playbackRate: 1.18, stopAfter: 1.45 },
    { src: `${mixkit}water-splash.mp3`, volume: 0.38, delay: 0.5, playbackRate: 0.72, stopAfter: 0.9 }
  ],
  "volcano": [
    { src: `${mixkit}rumble.mp3`, volume: 0.5, playbackRate: 0.76, stopAfter: 1.7 },
    { src: `${mixkit}explosion.mp3`, volume: 0.62, delay: 0.28, stopAfter: 1.35 },
    { src: `${kenney}impact-rock.ogg`, volume: 0.5, delay: 0.62 }
  ],
  "game-finish": [
    { src: `${mixkit}ui-success.mp3`, volume: 0.6, playbackRate: 0.92, stopAfter: 1.9 },
    { src: `${mixkit}ui-positive.mp3`, volume: 0.36, delay: 0.48, playbackRate: 1.08, stopAfter: 1.2 },
    { src: `${mixkit}wooden-ship-sea.mp3`, volume: 0.16, startAt: 0.45, stopAfter: 1.9 }
  ]
};

export const soundDefinitions: SoundDefinition[] = [
  { id: "player-joined", label: "玩家加入", category: "setup", description: "清亮确认音，简短欢迎新玩家。", duration: "1.1s", source: "Mixkit" },
  { id: "game-start", label: "远征开始", category: "setup", description: "成功乐句叠加真实木船海浪，建立出航感。", duration: "1.8s", source: "Mixkit" },
  { id: "explorer-place", label: "放置探险者", category: "setup", description: "软质棋子落下与草地接触的 Foley。", duration: "0.3s", source: "Kenney CC0" },
  { id: "raft-place", label: "放置木筏", category: "setup", description: "木板落点与海水飞溅的双层组合。", duration: "0.7s", source: "Mixkit + Kenney CC0" },
  { id: "ui-select", label: "选择棋子", category: "ui", description: "极短实体碰触音，减少电子按钮感。", duration: "0.15s", source: "Kenney CC0" },
  { id: "turn-start", label: "回合开始", category: "ui", description: "清晰但克制的控制权提示。", duration: "0.9s", source: "Mixkit" },
  { id: "rising-prompt", label: "进入沉岛阶段", category: "ui", description: "下降掠过声与岩石触发音。", duration: "0.6s", source: "Mixkit + Kenney CC0" },
  { id: "creature-prompt", label: "进入生物阶段", category: "ui", description: "四段实体碰撞模拟木骰滚动落定。", duration: "0.5s", source: "Kenney CC0" },
  { id: "explorer-step", label: "陆地移动", category: "movement", description: "两次独立草地脚步，保留自然差异。", duration: "0.35s", source: "Kenney CC0" },
  { id: "swimmer-move", label: "游泳移动", category: "movement", description: "真实近距离游泳划水录音。", duration: "0.7s", source: "Mixkit" },
  { id: "raft-move", label: "木筏移动", category: "movement", description: "船体扭动与侧面水花分层。", duration: "0.9s", source: "Mixkit" },
  { id: "raft-board", label: "自动登船", category: "movement", description: "木板脚步、船体受力和轻水花。", duration: "0.55s", source: "Mixkit + Kenney CC0" },
  { id: "explorer-rescue", label: "成功获救", category: "reward", description: "温暖成功提示配合靠岸水花。", duration: "1.8s", source: "Mixkit" },
  { id: "explorer-lost", label: "探险者遇难", category: "movement", description: "重落水后以低沉金属余音收束。", duration: "1.1s", source: "Mixkit + Kenney CC0" },
  { id: "tile-flip", label: "翻开地块", category: "board", description: "真实纸牌挥动与软质落点。", duration: "0.6s", source: "Mixkit + Kenney CC0" },
  { id: "tile-sink", label: "地块沉没", category: "board", description: "岩石撞击、低频震动和海水吞没三层组合。", duration: "1.2s", source: "Mixkit + Kenney CC0" },
  { id: "raft-reveal", label: "翻出木筏", category: "board", description: "水下浮出、木板展开和奖励提示。", duration: "0.9s", source: "Mixkit" },
  { id: "ability-draw", label: "获得能力牌", category: "reward", description: "快速抽牌后以正向提示确认。", duration: "0.9s", source: "Mixkit" },
  { id: "ability-use", label: "使用能力牌", category: "reward", description: "卡牌落下叠加自然魔法掠过声。", duration: "0.9s", source: "Mixkit" },
  { id: "repellent-ready", label: "驱逐剂响应", category: "reward", description: "提示音下铺一层低音威胁，表达响应窗口。", duration: "0.8s", source: "Mixkit" },
  { id: "repellent-use", label: "驱逐剂生效", category: "reward", description: "快速喷散、怪物退却与安全确认。", duration: "0.9s", source: "Mixkit" },
  { id: "creature-die", label: "生物骰", category: "board", description: "四次不同材质和力度的实体骰子碰撞。", duration: "0.55s", source: "Kenney CC0" },
  { id: "creature-spawn", label: "生物出现", category: "creature", description: "水面扰动下浮出一层经过变调的生物低鸣。", duration: "0.9s", source: "Mixkit" },
  { id: "creature-skip", label: "跳过生物移动", category: "creature", description: "快速掠过与轻触收尾，表达阶段关闭。", duration: "0.45s", source: "Mixkit + Kenney CC0" },
  { id: "shark-move", label: "鲨鱼移动", category: "creature", description: "鱼体切水与低速掠过声。", duration: "0.7s", source: "Mixkit" },
  { id: "shark-attack", label: "鲨鱼攻击", category: "creature", description: "高速冲刺、咬合冲击和大水花。", duration: "0.85s", source: "Mixkit + Kenney CC0" },
  { id: "serpent-move", label: "海蛇移动", category: "creature", description: "缓慢划水叠加短促爬行类低鸣。", duration: "0.95s", source: "Mixkit" },
  { id: "serpent-attack", label: "海蛇攻击", category: "creature", description: "龙类咆哮、重击和大型落水。", duration: "1.15s", source: "Mixkit + Kenney CC0" },
  { id: "kaiju-move", label: "巨兽移动", category: "creature", description: "真实巨型脚步下铺持续低频震动。", duration: "0.9s", source: "Mixkit" },
  { id: "kaiju-attack", label: "巨兽撞击", category: "creature", description: "巨兽吼叫、重击与木材碎裂。", duration: "1.25s", source: "Mixkit + Kenney CC0" },
  { id: "unit-displaced", label: "单位被推离", category: "movement", description: "快速位移掠过后接软质落点。", duration: "0.5s", source: "Mixkit + Kenney CC0" },
  { id: "whirlpool", label: "漩涡出现", category: "board", description: "减速水流、低频吸力与下沉水花。", duration: "1.5s", source: "Mixkit" },
  { id: "volcano", label: "火山爆发", category: "board", description: "深层震动、远距离爆炸和碎石落点。", duration: "1.7s", source: "Mixkit + Kenney CC0" },
  { id: "game-finish", label: "远征结算", category: "reward", description: "完整成功乐句、明亮确认和远处木船海浪。", duration: "1.9s", source: "Mixkit" }
];

const playing = new Set<HTMLAudioElement>();
const timers = new Set<number>();

type SoundChannel = "preview" | "game";

const channelAudio: Record<SoundChannel, Set<HTMLAudioElement>> = {
  preview: playing,
  game: new Set<HTMLAudioElement>()
};
const channelTimers: Record<SoundChannel, Set<number>> = {
  preview: timers,
  game: new Set<number>()
};

export function stopSounds(channel: SoundChannel = "preview") {
  channelTimers[channel].forEach((timer) => window.clearTimeout(timer));
  channelTimers[channel].clear();
  channelAudio[channel].forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
  channelAudio[channel].clear();
}

export function stopSoundPreview() {
  stopSounds("preview");
}

function schedule(layer: SoundLayer, masterVolume: number, channel: SoundChannel, baseDelay: number) {
  const timersForChannel = channelTimers[channel];
  const audioForChannel = channelAudio[channel];
  const timer = window.setTimeout(() => {
    timersForChannel.delete(timer);
    const audio = new Audio(layer.src);
    audio.preload = "auto";
    audio.volume = Math.max(0, Math.min(1, layer.volume * masterVolume));
    audio.playbackRate = layer.playbackRate ?? 1;
    audioForChannel.add(audio);

    const start = () => {
      if (layer.startAt) audio.currentTime = Math.min(layer.startAt, Math.max(0, audio.duration - 0.05));
      void audio.play().catch(() => audioForChannel.delete(audio));
    };
    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) start();
    else audio.addEventListener("loadedmetadata", start, { once: true });

    audio.addEventListener("ended", () => audioForChannel.delete(audio), { once: true });
    if (layer.stopAfter) {
      const stopTimer = window.setTimeout(() => {
        timersForChannel.delete(stopTimer);
        audio.pause();
        audioForChannel.delete(audio);
      }, layer.stopAfter * 1000);
      timersForChannel.add(stopTimer);
    }
  }, (baseDelay + (layer.delay ?? 0)) * 1000);
  timersForChannel.add(timer);
}

export function playSound(
  id: SoundId,
  volume = 0.72,
  options: { channel?: SoundChannel; interrupt?: boolean; delay?: number } = {}
) {
  const channel = options.channel ?? "preview";
  if (options.interrupt ?? channel === "preview") stopSounds(channel);
  layers[id].forEach((layer) => schedule(layer, volume, channel, options.delay ?? 0));
}
