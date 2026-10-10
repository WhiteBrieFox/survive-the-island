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
};

export const soundDefinitions: SoundDefinition[] = [
  { id: "player-joined", label: "玩家加入", category: "setup", description: "轻快的木琴与海风铃，表示队伍增加新成员。", duration: "0.48s" },
  { id: "game-start", label: "远征开始", category: "setup", description: "短号般的明亮和弦，建立出发的仪式感。", duration: "1.08s" },
  { id: "explorer-place", label: "放置探险者", category: "setup", description: "棋子落在厚纸板上的木质触感。", duration: "0.3s" },
  { id: "raft-place", label: "放置木筏", category: "setup", description: "木筏轻落水面，带一圈柔和水波。", duration: "0.52s" },
  { id: "ui-select", label: "选择棋子", category: "ui", description: "轻巧木质点击，确认选中但不过度抢戏。", duration: "0.12s" },
  { id: "turn-start", label: "回合开始", category: "ui", description: "明亮双音提示，提醒玩家获得控制权。", duration: "0.42s" },
  { id: "rising-prompt", label: "进入沉岛阶段", category: "ui", description: "略带紧张的下降提示，提醒选择最低地势。", duration: "0.58s" },
  { id: "creature-prompt", label: "进入生物阶段", category: "ui", description: "骰子轻摇与低音提示，提醒玩家掷生物骰。", duration: "0.62s" },
  { id: "explorer-step", label: "陆地移动", category: "movement", description: "沙土脚步与轻微装备晃动。", duration: "0.28s" },
  { id: "swimmer-move", label: "游泳移动", category: "movement", description: "短促划水声，保持清爽而不黏腻。", duration: "0.48s" },
  { id: "raft-move", label: "木筏移动", category: "movement", description: "木板受力、划桨入水和尾部水花。", duration: "0.72s" },
  { id: "raft-board", label: "自动登船", category: "movement", description: "抓住木筏、木板轻响与安全确认音。", duration: "0.46s" },
  { id: "explorer-rescue", label: "成功获救", category: "reward", description: "温暖上行旋律，强调得分与抵达终点。", duration: "1.05s" },
  { id: "explorer-lost", label: "探险者遇难", category: "movement", description: "短促落水与低沉收束，明确损失但不制造惊吓。", duration: "0.78s" },
  { id: "tile-flip", label: "翻开地块", category: "board", description: "厚纸板翻转与悬念尾音。", duration: "0.42s" },
  { id: "tile-sink", label: "地块沉没", category: "board", description: "岩土崩落、气泡和低频入水。", duration: "0.9s" },
  { id: "raft-reveal", label: "翻出木筏", category: "board", description: "水下木材浮起、排水，再以清亮提示收尾。", duration: "0.82s" },
  { id: "ability-draw", label: "获得能力牌", category: "reward", description: "卡牌抽出与短促闪光提示。", duration: "0.5s" },
  { id: "ability-use", label: "使用能力牌", category: "reward", description: "纸牌挥出与魔法般的清亮释放音。", duration: "0.62s" },
  { id: "repellent-ready", label: "驱逐剂响应", category: "reward", description: "克制的警报脉冲，提示玩家可以响应攻击。", duration: "0.58s" },
  { id: "repellent-use", label: "驱逐剂生效", category: "reward", description: "喷雾释放、怪物退散与安全确认音。", duration: "0.86s" },
  { id: "creature-die", label: "生物骰", category: "board", description: "木骰滚动、碰撞并落定。", duration: "0.72s" },
  { id: "creature-spawn", label: "生物出现", category: "creature", description: "水下涌动与短促危险提示，用于新生物登场。", duration: "0.82s" },
  { id: "creature-skip", label: "跳过生物移动", category: "creature", description: "柔和的空拍与收束音，明确本阶段已跳过。", duration: "0.45s" },
  { id: "shark-move", label: "鲨鱼移动", category: "creature", description: "快速切水与低沉掠过声。", duration: "0.48s" },
  { id: "shark-attack", label: "鲨鱼攻击", category: "creature", description: "突然冲刺、咬合与水花，短而明确。", duration: "0.68s" },
  { id: "serpent-move", label: "海蛇移动", category: "creature", description: "蛇形水流和轻微鳞片摩擦。", duration: "0.68s" },
  { id: "serpent-attack", label: "海蛇攻击", category: "creature", description: "深水上涌、嘶鸣与重击水面。", duration: "1.0s" },
  { id: "kaiju-move", label: "巨兽移动", category: "creature", description: "厚重脚步、地面震动与低吼。", duration: "0.82s" },
  { id: "kaiju-attack", label: "巨兽撞击", category: "creature", description: "沉重推撞、木材碎裂与冲击尾音。", duration: "1.05s" },
  { id: "unit-displaced", label: "单位被推离", category: "movement", description: "短促滑动、失衡和落点碰撞。", duration: "0.5s" },
  { id: "whirlpool", label: "漩涡出现", category: "board", description: "旋转水流逐渐收紧并向下吞噬。", duration: "1.45s" },
  { id: "volcano", label: "火山爆发", category: "board", description: "地下隆隆、爆裂与碎石落下。", duration: "1.5s" },
  { id: "game-finish", label: "远征结算", category: "reward", description: "岛屿主题的完整胜利乐句，为最终计分收尾。", duration: "1.55s" }
];

let context: AudioContext | null = null;

function audioContext() {
  context ??= new AudioContext();
  return context;
}

function output(ctx: AudioContext, volume: number) {
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(1, volume));
  gain.connect(ctx.destination);
  return gain;
}

function envelope(
  ctx: AudioContext,
  destination: AudioNode,
  start: number,
  attack: number,
  decay: number,
  peak: number
) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
  gain.connect(destination);
  return gain;
}

function tone(
  ctx: AudioContext,
  destination: AudioNode,
  start: number,
  frequency: number,
  duration: number,
  options: {
    endFrequency?: number;
    type?: OscillatorType;
    gain?: number;
    attack?: number;
    detune?: number;
  } = {}
) {
  const oscillator = ctx.createOscillator();
  const gain = envelope(ctx, destination, start, options.attack ?? 0.008, duration, options.gain ?? 0.16);
  oscillator.type = options.type ?? "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  if (options.endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, start + duration);
  }
  oscillator.detune.value = options.detune ?? 0;
  oscillator.connect(gain);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.04);
}

function noise(
  ctx: AudioContext,
  destination: AudioNode,
  start: number,
  duration: number,
  options: {
    gain?: number;
    highpass?: number;
    lowpass?: number;
    attack?: number;
  } = {}
) {
  const length = Math.max(1, Math.ceil(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / length * 0.24);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  let node: AudioNode = source;
  if (options.highpass) {
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = options.highpass;
    node.connect(filter);
    node = filter;
  }
  if (options.lowpass) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = options.lowpass;
    node.connect(filter);
    node = filter;
  }
  const gain = envelope(ctx, destination, start, options.attack ?? 0.004, duration, options.gain ?? 0.12);
  node.connect(gain);
  source.start(start);
  source.stop(start + duration + 0.03);
}

function thump(ctx: AudioContext, destination: AudioNode, start: number, gain = 0.22) {
  tone(ctx, destination, start, 105, 0.2, { endFrequency: 42, type: "sine", gain, attack: 0.004 });
  noise(ctx, destination, start, 0.11, { gain: gain * 0.48, lowpass: 460 });
}

function splash(ctx: AudioContext, destination: AudioNode, start: number, gain = 0.16, duration = 0.35) {
  noise(ctx, destination, start, duration, { gain, highpass: 420, lowpass: 5200, attack: 0.012 });
  tone(ctx, destination, start + 0.03, 360, duration * 0.72, { endFrequency: 125, type: "sine", gain: gain * 0.45 });
}

function chime(ctx: AudioContext, destination: AudioNode, start: number, notes: number[], gain = 0.12) {
  notes.forEach((frequency, index) => {
    tone(ctx, destination, start + index * 0.11, frequency, 0.28, { type: "sine", gain, attack: 0.006 });
    tone(ctx, destination, start + index * 0.11, frequency * 2, 0.2, { type: "triangle", gain: gain * 0.28 });
  });
}

export async function playSound(id: SoundId, volume = 0.72) {
  const ctx = audioContext();
  if (ctx.state === "suspended") await ctx.resume();
  const destination = output(ctx, volume);
  const now = ctx.currentTime + 0.025;

  switch (id) {
    case "player-joined":
      chime(ctx, destination, now, [659.25, 880], 0.085);
      tone(ctx, destination, now + 0.04, 1760, 0.3, { endFrequency: 1320, type: "sine", gain: 0.035 });
      break;
    case "game-start":
      [392, 523.25, 659.25].forEach((frequency) => {
        tone(ctx, destination, now, frequency, 0.72, { type: "triangle", gain: 0.075, attack: 0.025 });
      });
      chime(ctx, destination, now + 0.28, [783.99, 1046.5], 0.08);
      noise(ctx, destination, now + 0.08, 0.56, { gain: 0.025, highpass: 1800, lowpass: 6200, attack: 0.16 });
      break;
    case "explorer-place":
      thump(ctx, destination, now, 0.1);
      noise(ctx, destination, now + 0.02, 0.12, { gain: 0.055, lowpass: 1250 });
      tone(ctx, destination, now + 0.08, 1180, 0.13, { endFrequency: 890, type: "triangle", gain: 0.025 });
      break;
    case "raft-place":
      noise(ctx, destination, now, 0.13, { gain: 0.075, lowpass: 720 });
      splash(ctx, destination, now + 0.08, 0.09, 0.34);
      tone(ctx, destination, now + 0.14, 190, 0.25, { endFrequency: 125, type: "triangle", gain: 0.055 });
      break;
    case "ui-select":
      tone(ctx, destination, now, 740, 0.08, { endFrequency: 920, type: "triangle", gain: 0.1 });
      tone(ctx, destination, now, 230, 0.09, { type: "sine", gain: 0.04 });
      break;
    case "turn-start":
      chime(ctx, destination, now, [523.25, 783.99], 0.11);
      break;
    case "rising-prompt":
      tone(ctx, destination, now, 622.25, 0.36, { endFrequency: 311.13, type: "triangle", gain: 0.08, attack: 0.02 });
      thump(ctx, destination, now + 0.28, 0.1);
      break;
    case "creature-prompt":
      [0, 0.1, 0.2].forEach((offset, index) => {
        noise(ctx, destination, now + offset, 0.07, { gain: 0.055 + index * 0.012, lowpass: 1150 });
      });
      tone(ctx, destination, now + 0.27, 196, 0.25, { endFrequency: 146.83, type: "triangle", gain: 0.07 });
      break;
    case "explorer-step":
      noise(ctx, destination, now, 0.09, { gain: 0.1, lowpass: 900 });
      noise(ctx, destination, now + 0.12, 0.1, { gain: 0.075, lowpass: 1100 });
      tone(ctx, destination, now + 0.04, 2100, 0.12, { endFrequency: 1450, type: "triangle", gain: 0.025 });
      break;
    case "swimmer-move":
      splash(ctx, destination, now, 0.12, 0.28);
      splash(ctx, destination, now + 0.2, 0.09, 0.25);
      break;
    case "raft-move":
      tone(ctx, destination, now, 145, 0.32, { endFrequency: 96, type: "triangle", gain: 0.08 });
      noise(ctx, destination, now + 0.08, 0.18, { gain: 0.07, lowpass: 750 });
      splash(ctx, destination, now + 0.2, 0.11, 0.42);
      break;
    case "raft-board":
      noise(ctx, destination, now, 0.12, { gain: 0.09, lowpass: 760 });
      tone(ctx, destination, now + 0.08, 180, 0.16, { endFrequency: 120, type: "triangle", gain: 0.08 });
      chime(ctx, destination, now + 0.17, [659.25], 0.07);
      break;
    case "explorer-rescue":
      chime(ctx, destination, now, [523.25, 659.25, 783.99, 1046.5], 0.11);
      tone(ctx, destination, now + 0.36, 1567.98, 0.48, { type: "sine", gain: 0.065 });
      break;
    case "explorer-lost":
      splash(ctx, destination, now, 0.12, 0.38);
      tone(ctx, destination, now + 0.16, 293.66, 0.48, { endFrequency: 110, type: "triangle", gain: 0.08, attack: 0.03 });
      thump(ctx, destination, now + 0.38, 0.08);
      break;
    case "tile-flip":
      noise(ctx, destination, now, 0.12, { gain: 0.1, highpass: 600, lowpass: 3200 });
      tone(ctx, destination, now + 0.07, 320, 0.22, { endFrequency: 210, type: "triangle", gain: 0.07 });
      break;
    case "tile-sink":
      noise(ctx, destination, now, 0.45, { gain: 0.12, lowpass: 680 });
      thump(ctx, destination, now + 0.08, 0.17);
      splash(ctx, destination, now + 0.28, 0.13, 0.52);
      break;
    case "raft-reveal":
      tone(ctx, destination, now, 118, 0.5, { endFrequency: 210, type: "sine", gain: 0.07, attack: 0.08 });
      splash(ctx, destination, now + 0.04, 0.08, 0.44);
      noise(ctx, destination, now + 0.15, 0.22, { gain: 0.06, lowpass: 780 });
      chime(ctx, destination, now + 0.38, [659.25], 0.06);
      break;
    case "ability-draw":
      noise(ctx, destination, now, 0.18, { gain: 0.06, highpass: 1100, lowpass: 5200 });
      chime(ctx, destination, now + 0.08, [880, 1174.66], 0.075);
      break;
    case "ability-use":
      noise(ctx, destination, now, 0.28, { gain: 0.07, highpass: 800, lowpass: 6200 });
      tone(ctx, destination, now, 440, 0.36, { endFrequency: 1320, type: "sine", gain: 0.08 });
      chime(ctx, destination, now + 0.22, [987.77], 0.07);
      break;
    case "repellent-ready":
      tone(ctx, destination, now, 740, 0.12, { endFrequency: 560, type: "square", gain: 0.045 });
      tone(ctx, destination, now + 0.2, 740, 0.12, { endFrequency: 560, type: "square", gain: 0.045 });
      tone(ctx, destination, now + 0.08, 185, 0.38, { type: "sine", gain: 0.035, attack: 0.03 });
      break;
    case "repellent-use":
      noise(ctx, destination, now, 0.48, { gain: 0.1, highpass: 1100, lowpass: 7200, attack: 0.04 });
      tone(ctx, destination, now + 0.08, 260, 0.42, { endFrequency: 90, type: "sawtooth", gain: 0.055, attack: 0.05 });
      chime(ctx, destination, now + 0.38, [659.25, 987.77], 0.065);
      break;
    case "creature-die":
      [0, 0.11, 0.21, 0.31].forEach((offset, index) => {
        noise(ctx, destination, now + offset, 0.065, { gain: 0.09 - index * 0.012, lowpass: 1100 });
        tone(ctx, destination, now + offset, 185 + index * 33, 0.08, { type: "triangle", gain: 0.055 });
      });
      thump(ctx, destination, now + 0.43, 0.13);
      break;
    case "creature-spawn":
      tone(ctx, destination, now, 92, 0.64, { endFrequency: 180, type: "sawtooth", gain: 0.065, attack: 0.12 });
      noise(ctx, destination, now, 0.58, { gain: 0.08, highpass: 180, lowpass: 1500, attack: 0.15 });
      splash(ctx, destination, now + 0.28, 0.11, 0.36);
      tone(ctx, destination, now + 0.48, 466.16, 0.2, { endFrequency: 233.08, type: "triangle", gain: 0.055 });
      break;
    case "creature-skip":
      noise(ctx, destination, now, 0.18, { gain: 0.035, highpass: 900, lowpass: 3600, attack: 0.04 });
      tone(ctx, destination, now + 0.02, 440, 0.3, { endFrequency: 349.23, type: "sine", gain: 0.05 });
      tone(ctx, destination, now + 0.18, 293.66, 0.2, { type: "triangle", gain: 0.035 });
      break;
    case "shark-move":
      noise(ctx, destination, now, 0.36, { gain: 0.1, highpass: 320, lowpass: 2600, attack: 0.06 });
      tone(ctx, destination, now, 185, 0.38, { endFrequency: 92, type: "sine", gain: 0.07, attack: 0.04 });
      break;
    case "shark-attack":
      noise(ctx, destination, now, 0.16, { gain: 0.16, highpass: 800, lowpass: 6200 });
      tone(ctx, destination, now + 0.05, 165, 0.24, { endFrequency: 48, type: "sawtooth", gain: 0.1 });
      splash(ctx, destination, now + 0.18, 0.14, 0.36);
      break;
    case "serpent-move":
      tone(ctx, destination, now, 230, 0.58, { endFrequency: 125, type: "sine", gain: 0.085, attack: 0.08 });
      noise(ctx, destination, now + 0.08, 0.42, { gain: 0.065, highpass: 700, lowpass: 2800, attack: 0.1 });
      break;
    case "serpent-attack":
      tone(ctx, destination, now, 310, 0.52, { endFrequency: 75, type: "sawtooth", gain: 0.1, attack: 0.08 });
      noise(ctx, destination, now + 0.08, 0.45, { gain: 0.12, highpass: 950, lowpass: 5200 });
      splash(ctx, destination, now + 0.38, 0.17, 0.5);
      thump(ctx, destination, now + 0.42, 0.14);
      break;
    case "kaiju-move":
      thump(ctx, destination, now, 0.22);
      tone(ctx, destination, now + 0.08, 74, 0.55, { endFrequency: 42, type: "sawtooth", gain: 0.055, attack: 0.08 });
      noise(ctx, destination, now + 0.12, 0.38, { gain: 0.065, lowpass: 380 });
      break;
    case "kaiju-attack":
      tone(ctx, destination, now, 92, 0.72, { endFrequency: 36, type: "sawtooth", gain: 0.11, attack: 0.05 });
      thump(ctx, destination, now + 0.24, 0.25);
      noise(ctx, destination, now + 0.22, 0.55, { gain: 0.13, lowpass: 820 });
      noise(ctx, destination, now + 0.38, 0.28, { gain: 0.08, highpass: 1200, lowpass: 4400 });
      break;
    case "unit-displaced":
      noise(ctx, destination, now, 0.28, { gain: 0.085, highpass: 320, lowpass: 1700, attack: 0.06 });
      tone(ctx, destination, now, 420, 0.32, { endFrequency: 160, type: "triangle", gain: 0.055 });
      thump(ctx, destination, now + 0.27, 0.09);
      break;
    case "whirlpool":
      noise(ctx, destination, now, 1.2, { gain: 0.11, highpass: 90, lowpass: 1600, attack: 0.2 });
      tone(ctx, destination, now, 260, 1.25, { endFrequency: 48, type: "sine", gain: 0.1, attack: 0.18 });
      tone(ctx, destination, now + 0.28, 420, 0.86, { endFrequency: 72, type: "triangle", gain: 0.045, attack: 0.15 });
      break;
    case "volcano":
      tone(ctx, destination, now, 62, 1.32, { endFrequency: 32, type: "sawtooth", gain: 0.12, attack: 0.15 });
      noise(ctx, destination, now + 0.08, 1.18, { gain: 0.13, lowpass: 950, attack: 0.12 });
      thump(ctx, destination, now + 0.36, 0.25);
      [0.62, 0.78, 0.94].forEach((offset) => {
        noise(ctx, destination, now + offset, 0.17, { gain: 0.06, highpass: 900, lowpass: 3600 });
      });
      break;
    case "game-finish":
      chime(ctx, destination, now, [523.25, 659.25, 783.99], 0.085);
      [261.63, 392, 523.25].forEach((frequency) => {
        tone(ctx, destination, now + 0.34, frequency, 0.88, { type: "triangle", gain: 0.06, attack: 0.035 });
      });
      chime(ctx, destination, now + 0.58, [783.99, 1046.5, 1318.51], 0.075);
      tone(ctx, destination, now + 0.72, 1567.98, 0.58, { type: "sine", gain: 0.045 });
      break;
  }

  window.setTimeout(() => destination.disconnect(), 2200);
}
