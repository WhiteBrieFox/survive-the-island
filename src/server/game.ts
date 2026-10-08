import { randomUUID } from "node:crypto";
import { areAdjacent, createIslandCoords, hexDistance, hexKey } from "../shared/hex";
import {
  PLAYER_COLORS,
  type AIDifficulty,
  type AbilityType,
  type CreatureRoll,
  type CreatureType,
  type CreatureView,
  type ExplorerView,
  type GameEventView,
  type PlayerView,
  type PublicRoomState,
  type RaftView,
  type SpectatorView,
  type Terrain,
  type TileView,
  type TurnPhase,
  type WaterSpaceView
} from "../shared/types";

type TileEffect = "shark" | "kaiju" | "raft" | "whirlpool" | "volcano" | AbilityType;
interface GameTile extends TileView { effect: TileEffect; }
interface GameExplorer extends ExplorerView { value: number; }
interface PendingAttack {
  creatureId: string;
  locationId: string;
  responderIds: string[];
  declinedIds: string[];
}
interface Displacement {
  entityId: string;
  entityKind: "explorer" | "creature";
}

export interface GameRoom {
  code: string;
  phase: PublicRoomState["phase"];
  hostId: string;
  password: string;
  revision: number;
  players: PlayerView[];
  spectators: SpectatorView[];
  tiles: GameTile[];
  waterSpaces: WaterSpaceView[];
  explorers: GameExplorer[];
  rafts: RaftView[];
  creatures: CreatureView[];
  currentPlayerId: string | null;
  turnPhase: TurnPhase;
  creatureRoll: CreatureRoll | null;
  pendingChoice: PublicRoomState["pendingChoice"];
  actionsLeft: number;
  risingRemaining: number;
  round: number;
  volcanoes: number;
  maxVolcanoes: number;
  log: string[];
  events: GameEventView[];
  winnerIds: string[];
  setupPlaced: number;
  resumePhase: TurnPhase | null;
  creatureMovesRemaining: number;
  creatureMoved: boolean;
  turnStartedWithoutExplorers: boolean;
  pendingAttack: PendingAttack | null;
  displacementQueue: Displacement[];
  interactionContinuation: "none" | "finish-creature" | "displacement";
  reconnectTokens: Record<string, string>;
  spectatorTokens: Record<string, string>;
  aiTimer?: NodeJS.Timeout;
}

const TREASURES = [1, 1, 1, 2, 2, 2, 3, 3, 4, 5];
const TERRAIN: Terrain[] = [...Array<Terrain>(16).fill("beach"), ...Array<Terrain>(16).fill("forest"), ...Array<Terrain>(8).fill("mountain")];
const EFFECTS: Record<Terrain, TileEffect[]> = {
  beach: ["shark", "shark", "shark", "kaiju", "kaiju", "kaiju", "raft", "paddles", "paddles", "dolphin", "dolphin", "dolphin", "creature-die", "creature-die", "repellent", "repellent"],
  forest: ["shark", "shark", "shark", "kaiju", "kaiju", "raft", "raft", "raft", "whirlpool", "whirlpool", "dolphin", "dive", "dive", "creature-die", "creature-die", "repellent"],
  mountain: ["whirlpool", "whirlpool", "whirlpool", "whirlpool", "volcano", "volcano", "volcano", "volcano"]
};
const DIRS = [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }];
const abilityName: Record<AbilityType, string> = { paddles: "船桨", dolphin: "海豚", dive: "潜水", "creature-die": "生物骰", repellent: "驱逐剂" };
const creatureName = (type: CreatureType) => type === "sea-serpent" ? "海蛇" : type === "shark" ? "鲨鱼" : "巨兽";
const shuffle = <T>(input: T[]) => {
  const items = [...input];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};

function makePlayer(
  id: string,
  name: string,
  color: PlayerView["color"],
  isAI: boolean,
  aiDifficulty: AIDifficulty = "strategic"
): PlayerView {
  return { id, name, color, colors: [color], isAI, aiDifficulty, connected: true, ready: isAI, score: 0, rescued: 0, lost: 0, abilities: [], explorersToPlace: 0, raftsToPlace: 0 };
}

export function createRoom(code: string, hostId: string, hostName: string, password = ""): GameRoom {
  const room: GameRoom = {
    code, phase: "lobby", hostId, password, revision: 0,
    players: [makePlayer(hostId, hostName, PLAYER_COLORS[0], false)], spectators: [],
    tiles: [], waterSpaces: [], explorers: [], rafts: [], creatures: [],
    currentPlayerId: null, turnPhase: "setup-explorer", creatureRoll: null, pendingChoice: null,
    actionsLeft: 3, risingRemaining: 1, round: 1, volcanoes: 0, maxVolcanoes: 3,
    log: [], events: [], winnerIds: [], setupPlaced: 0, resumePhase: null,
    creatureMovesRemaining: 0, creatureMoved: false, turnStartedWithoutExplorers: false,
    pendingAttack: null, displacementQueue: [], interactionContinuation: "none",
    reconnectTokens: {}, spectatorTokens: {}
  };
  recordEvent(room, "room-created", `${hostName} 创建了房间`, hostId);
  return room;
}

export function addPlayer(room: GameRoom, id: string, name: string, isAI = false, aiDifficulty: AIDifficulty = "strategic") {
  if (room.phase !== "lobby") throw new Error("游戏已经开始，只能加入观战");
  if (room.players.length >= 5) throw new Error("玩家席位已满");
  const color = PLAYER_COLORS.find((candidate) => !room.players.some((player) => player.color === candidate));
  if (!color) throw new Error("没有可用颜色");
  room.players.push(makePlayer(id, name, color, isAI, aiDifficulty));
  recordEvent(room, "player-joined", `${name}${isAI ? "（AI）" : ""} 加入了远征`, id, { aiDifficulty });
  bump(room);
}

export function addSpectator(room: GameRoom, id: string, name: string) {
  room.spectators.push({ id, name, connected: true });
  recordEvent(room, "spectator-joined", `${name} 开始观战`, id);
  bump(room);
}

function rescueCoords(island: TileView[]) {
  const occupied = new Set(island.map(hexKey));
  const candidates = new Map<string, { q: number; r: number }>();
  for (const tile of island) for (const direction of DIRS) {
    const coord = { q: tile.q + direction.q, r: tile.r + direction.r };
    if (!occupied.has(hexKey(coord))) candidates.set(hexKey(coord), coord);
  }
  const angles = [-2.35, -0.78, 0.78, 2.35];
  const pool = [...candidates.values()];
  return angles.map((angle) => {
    const selected = pool.map((coord) => ({
      coord,
      score: Math.abs(Math.atan2(Math.sin(Math.atan2(coord.r, coord.q) - angle), Math.cos(Math.atan2(coord.r, coord.q) - angle))) - hexDistance({ q: 0, r: 0 }, coord) * 0.03
    })).sort((a, b) => a.score - b.score)[0].coord;
    pool.splice(pool.findIndex((coord) => hexKey(coord) === hexKey(selected)), 1);
    return selected;
  });
}

function waterSpaces(tiles: TileView[]) {
  const occupied = new Set(tiles.map(hexKey));
  const result: WaterSpaceView[] = [];
  for (let q = -7; q <= 7; q += 1) for (let r = -7; r <= 7; r += 1) {
    const coord = { q, r };
    if (hexDistance({ q: 0, r: 0 }, coord) <= 7 && !occupied.has(hexKey(coord))) result.push({ ...coord, id: `water-${q}-${r}` });
  }
  return result;
}

export function startGame(room: GameRoom) {
  if (room.phase !== "lobby") throw new Error("游戏已经开始");
  if (room.players.length < 2) throw new Error("至少需要 2 名玩家或 AI");
  if (room.players.some((player) => !player.isAI && !player.ready)) throw new Error("还有玩家没有准备");
  if (room.players.length === 2) {
    room.players[0].colors = [PLAYER_COLORS[0], PLAYER_COLORS[2]];
    room.players[1].colors = [PLAYER_COLORS[1], PLAYER_COLORS[3]];
  }
  const kinds = shuffle(TERRAIN);
  const pools = { beach: shuffle(EFFECTS.beach), forest: shuffle(EFFECTS.forest), mountain: shuffle(EFFECTS.mountain) };
  const island: GameTile[] = createIslandCoords(40).map((coord, index) => {
    const terrain = kinds[index];
    return { ...coord, id: `tile-${index}`, terrain, active: true, sinking: false, blocked: false, effect: pools[terrain].pop()! };
  });
  const rescues: GameTile[] = rescueCoords(island).map((coord, index) => ({
    ...coord, id: `rescue-${index}`, terrain: "beach", active: true, sinking: false, blocked: false, isRescue: true, effect: "raft"
  }));
  room.tiles = [...island, ...rescues];
  room.waterSpaces = waterSpaces(room.tiles);
  const explorerCount = room.players.length === 2 ? 20 : 10;
  room.explorers = room.players.flatMap((player) => {
    const values = shuffle(room.players.length === 2 ? [...TREASURES, ...TREASURES] : TREASURES);
    player.explorersToPlace = explorerCount;
    player.raftsToPlace = room.players.length === 2 ? 4 : 2;
    return values.map((value, index) => ({
      id: `${player.id}-explorer-${index}`, ownerId: player.id, tileId: null, locationId: null, raftId: null,
      color: player.colors[Math.floor(index / 10)] ?? player.colors[0],
      swimming: false, swamThisTurn: false, rescued: false, lost: false, value
    }));
  });
  const outer = [...room.waterSpaces].sort((a, b) => hexDistance({ q: 0, r: 0 }, b) - hexDistance({ q: 0, r: 0 }, a));
  room.creatures = [0, 1, 2, 3, 4].map((index) => ({
    id: `sea-serpent-${index}`, type: "sea-serpent", locationId: outer[Math.floor(index * outer.length / 5)].id
  }));
  room.rafts = [];
  room.phase = "playing";
  room.currentPlayerId = room.players[0].id;
  room.turnPhase = "setup-explorer";
  recordEvent(room, "game-started", "开始轮流放置探险者，放置时请记住宝藏价值", room.hostId, {
    terrain: island.map((tile) => ({ id: tile.id, terrain: tile.terrain, effect: tile.effect })),
    treasureValues: room.explorers.map((explorer) => ({ id: explorer.id, ownerId: explorer.ownerId, value: explorer.value }))
  });
  bump(room);
}

function requireTurn(room: GameRoom, playerId: string, phase?: TurnPhase) {
  if (room.phase !== "playing" || room.currentPlayerId !== playerId) throw new Error("还没轮到你");
  if (phase && room.turnPhase !== phase) throw new Error("当前阶段不能执行这个操作");
}
function cyclePlayer(room: GameRoom) {
  const index = room.players.findIndex((player) => player.id === room.currentPlayerId);
  room.currentPlayerId = room.players[(index + 1) % room.players.length].id;
}
function coord(room: GameRoom, id: string) {
  return room.tiles.find((tile) => tile.id === id) ?? room.waterSpaces.find((space) => space.id === id);
}
function isWater(room: GameRoom, id: string) {
  if (room.waterSpaces.some((space) => space.id === id)) return true;
  const tile = room.tiles.find((candidate) => candidate.id === id);
  return Boolean(tile && !tile.active && !tile.blocked);
}
function raftAt(room: GameRoom, id: string) { return room.rafts.find((raft) => raft.locationId === id); }
function occupants(room: GameRoom, raftId: string) { return room.explorers.filter((explorer) => explorer.raftId === raftId && !explorer.lost && !explorer.rescued); }
function adjacentIds(room: GameRoom, id: string) {
  const source = coord(room, id);
  return source ? [...room.tiles, ...room.waterSpaces].filter((item) => areAdjacent(source, item)).map((item) => item.id) : [];
}

export function placeExplorer(room: GameRoom, playerId: string, tileId: string) {
  requireTurn(room, playerId, "setup-explorer");
  const player = room.players.find((item) => item.id === playerId)!;
  const tile = room.tiles.find((item) => item.id === tileId && item.active && !item.isRescue);
  if (!tile) throw new Error("请选择岛屿地形");
  const count = room.explorers.filter((item) => item.locationId === tileId).length;
  const capacity = room.players.length === 5 && room.setupPlaced >= 40 ? 2 : 1;
  if (count >= capacity) throw new Error("这个格子不能再放探险者");
  const explorer = room.explorers.find((item) => item.ownerId === playerId && !item.locationId);
  if (!explorer) throw new Error("没有待放置的探险者");
  explorer.locationId = tileId;
  explorer.tileId = tileId;
  player.explorersToPlace -= 1;
  room.setupPlaced += 1;
  recordEvent(room, "explorer-placed", `${player.name} 放置了一名探险者`, playerId, {
    explorerId: explorer.id, tileId, value: explorer.value
  });
  if (room.players.every((item) => item.explorersToPlace === 0)) {
    room.turnPhase = "setup-raft";
    room.currentPlayerId = room.players[0].id;
    recordEvent(room, "setup-rafts", "开始轮流放置木筏");
  } else do cyclePlayer(room); while (room.players.find((item) => item.id === room.currentPlayerId)!.explorersToPlace === 0);
  bump(room);
}

export function placeRaft(room: GameRoom, playerId: string, waterId: string) {
  requireTurn(room, playerId, "setup-raft");
  const player = room.players.find((item) => item.id === playerId)!;
  const location = coord(room, waterId);
  if (!location || !isWater(room, waterId) || raftAt(room, waterId)) throw new Error("请选择空水域");
  if (!room.tiles.some((tile) => tile.active && !tile.isRescue && areAdjacent(location, tile))) throw new Error("木筏必须与岛屿相邻");
  room.rafts.push({ id: `raft-${randomUUID()}`, locationId: waterId });
  player.raftsToPlace -= 1;
  recordEvent(room, "raft-placed", `${player.name} 放置了一艘木筏`, playerId, { waterId });
  if (room.players.every((item) => item.raftsToPlace === 0)) {
    room.currentPlayerId = room.players[0].id;
    beginTurn(room);
    recordEvent(room, "turns-started", "远征正式开始");
  } else do cyclePlayer(room); while (room.players.find((item) => item.id === room.currentPlayerId)!.raftsToPlace === 0);
  bump(room);
}

function controlsRaft(room: GameRoom, playerId: string, raft: RaftView) {
  const aboard = occupants(room, raft.id);
  if (!aboard.length) return true;
  const counts = new Map<string, number>();
  aboard.forEach((item) => counts.set(item.ownerId, (counts.get(item.ownerId) ?? 0) + 1));
  const mine = counts.get(playerId) ?? 0;
  return mine > 0 && [...counts].every(([id, count]) => id === playerId || mine >= count);
}

export function moveExplorer(room: GameRoom, playerId: string, explorerId: string, targetId: string) {
  requireTurn(room, playerId, "action");
  if (room.actionsLeft <= 0) throw new Error("行动点已经用完");
  const explorer = room.explorers.find((item) => item.id === explorerId);
  if (!explorer || explorer.ownerId !== playerId || !explorer.locationId || explorer.lost || explorer.rescued) throw new Error("无法移动这个探险者");
  const from = coord(room, explorer.locationId);
  const to = coord(room, targetId);
  if (!from || !to || !areAdjacent(from, to)) throw new Error("只能移动到相邻格");
  const targetTile = room.tiles.find((tile) => tile.id === targetId);
  if (targetTile?.blocked || room.creatures.some((item) => item.type === "kaiju" && item.locationId === targetId)) throw new Error("该格被巨兽或火山阻挡");
  const destinationRaft = raftAt(room, targetId);
  if (destinationRaft && occupants(room, destinationRaft.id).length >= 3) throw new Error("木筏已经满员");
  const sourceStable = Boolean(explorer.raftId || room.tiles.some((tile) => tile.id === explorer.locationId && tile.active));
  const targetStable = Boolean(destinationRaft || targetTile?.active);
  const swims = !sourceStable || !targetStable;
  if (swims && explorer.swamThisTurn) throw new Error("这名探险者本回合已经游过一次");
  explorer.locationId = targetId;
  explorer.tileId = targetId;
  explorer.raftId = destinationRaft?.id ?? null;
  explorer.swimming = isWater(room, targetId) && !destinationRaft;
  if (swims) explorer.swamThisTurn = true;
  room.actionsLeft -= 1;
  const player = room.players.find((item) => item.id === playerId)!;
  if (targetTile?.isRescue) {
    explorer.locationId = explorer.tileId = explorer.raftId = null;
    explorer.swimming = false;
    explorer.rescued = true;
    player.score += explorer.value;
    player.rescued += 1;
    recordEvent(room, "explorer-rescued", `${player.name} 救出探险者，获得 ${explorer.value} 分`, playerId, {
      explorerId, value: explorer.value
    });
  } else {
    recordEvent(room, "explorer-moved", `${player.name} 移动了一名探险者`, playerId, {
      explorerId, targetId
    });
    resolveInteractions(room, targetId);
  }
  bump(room);
  checkFinished(room);
}

export function moveRaft(room: GameRoom, playerId: string, raftId: string, targetId: string, free = false) {
  requireTurn(room, playerId, "action");
  if (!free && room.actionsLeft <= 0) throw new Error("行动点已经用完");
  const raft = room.rafts.find((item) => item.id === raftId);
  const from = raft ? coord(room, raft.locationId) : undefined;
  const to = coord(room, targetId);
  if (!raft || !controlsRaft(room, playerId, raft)) throw new Error("你不能控制这艘木筏");
  if (!from || !to || !areAdjacent(from, to) || !isWater(room, targetId) || raftAt(room, targetId)) throw new Error("木筏目标不合法");
  if (room.creatures.some((item) => item.type === "kaiju" && item.locationId === targetId)) throw new Error("巨兽阻挡了目标");
  raft.locationId = targetId;
  occupants(room, raft.id).forEach((explorer) => { explorer.locationId = targetId; explorer.tileId = targetId; });
  if (!free) room.actionsLeft -= 1;
  resolveInteractions(room, targetId);
  recordEvent(room, "raft-moved", "木筏移动了", playerId, { raftId, targetId, free });
  bump(room);
}

export function endTurn(room: GameRoom) {
  if (!room.currentPlayerId) return;
  requireTurn(room, room.currentPlayerId, "action");
  room.turnPhase = "rising";
  room.actionsLeft = 0;
  room.risingRemaining = room.turnStartedWithoutExplorers ? 2 : 1;
  recordEvent(room, "action-ended", `请选择 ${room.risingRemaining} 块最低地势`, room.currentPlayerId, {
    risingRemaining: room.risingRemaining
  });
  bump(room);
}

export function sinkChosenTile(room: GameRoom, playerId: string, tileId: string) {
  requireTurn(room, playerId, "rising");
  const active = room.tiles.filter((tile) => tile.active && !tile.isRescue);
  const rank: Record<Terrain, number> = { beach: 0, forest: 1, mountain: 2 };
  const lowest = Math.min(...active.map((tile) => rank[tile.terrain]));
  const tile = active.find((item) => item.id === tileId);
  if (!tile || rank[tile.terrain] !== lowest) throw new Error("必须选择当前最低地势");
  tile.active = false;
  room.explorers.filter((item) => item.locationId === tile.id && !item.raftId).forEach((item) => { item.swimming = true; });
  recordEvent(room, "tile-sunk", `${tile.terrain === "beach" ? "海滩" : tile.terrain === "forest" ? "森林" : "山地"}沉入海中`, playerId, {
    tileId, terrain: tile.terrain, effect: tile.effect
  });
  applyEffect(room, playerId, tile);
  room.risingRemaining -= 1;
  bump(room);
  if (checkFinished(room)) return;
  if (!room.pendingChoice) finishRisingStep(room, playerId);
}

function finishRisingStep(room: GameRoom, playerId = room.currentPlayerId ?? undefined) {
  if (room.turnPhase === "rising" && room.risingRemaining <= 0) {
    room.turnPhase = "creature";
    recordEvent(room, "creature-phase", "请掷生物骰", playerId);
    bump(room);
  }
}

function applyEffect(room: GameRoom, playerId: string, tile: GameTile) {
  if (tile.effect === "volcano") {
    tile.blocked = true;
    eliminateAt(room, tile.id, true, false);
    room.creatures = room.creatures.filter((item) => item.locationId !== tile.id);
    room.volcanoes += 1;
    recordEvent(room, "volcano", `火山爆发（${room.volcanoes}/${room.maxVolcanoes}）`, playerId, { tileId: tile.id });
  } else if (tile.effect === "whirlpool") {
    [tile.id, ...adjacentIds(room, tile.id).filter((id) => isWater(room, id))].forEach((id) => {
      eliminateAt(room, id, true, true);
      room.creatures = room.creatures.filter((item) => item.locationId !== id);
    });
    recordEvent(room, "whirlpool", "漩涡吞噬了周围的一切", playerId, { tileId: tile.id });
  } else if (tile.effect === "shark" || tile.effect === "kaiju") {
    spawnCreature(room, tile.effect, tile.id);
    resolveInteractions(room, tile.id);
  } else if (tile.effect === "raft") {
    if (room.rafts.length < 12) room.rafts.push({ id: `raft-${randomUUID()}`, locationId: tile.id });
    else {
      const empty = room.rafts.find((raft) => occupants(room, raft.id).length === 0);
      if (empty) empty.locationId = tile.id;
    }
    const raft = raftAt(room, tile.id);
    if (raft) {
      const candidates = room.explorers.filter((item) => item.locationId === raft.locationId && item.swimming);
      const available = 3 - occupants(room, raft.id).length;
      if (candidates.length > available) {
        room.pendingChoice = {
          type: "board-raft",
          raftId: raft.id,
          candidateExplorerIds: candidates.map((item) => item.id),
          maxSelections: available
        };
      } else autoBoard(room, raft);
    }
    recordEvent(room, "raft-revealed", "一艘木筏浮出水面", playerId, { tileId: tile.id });
  } else {
    const player = room.players.find((item) => item.id === playerId)!;
    player.abilities.push(tile.effect);
    recordEvent(room, "ability-drawn", `${player.name} 获得${abilityName[tile.effect]}`, playerId, {
      ability: tile.effect
    });
  }
}

function spawnCreature(room: GameRoom, type: CreatureType, locationId: string) {
  const limit = type === "shark" ? 6 : 2;
  const same = room.creatures.filter((item) => item.type === type);
  if (type === "kaiju") room.creatures = room.creatures.filter((item) => !(item.type === "kaiju" && item.locationId === locationId));
  if (same.length >= limit) same[0].locationId = locationId;
  else room.creatures.push({ id: `${type}-${randomUUID()}`, type, locationId });
  recordEvent(room, "creature-spawned", `${creatureName(type)}出现了`, room.currentPlayerId ?? undefined, {
    type, locationId
  });
}

export function rollCreatureDie(room: GameRoom, playerId: string) {
  requireTurn(room, playerId, "creature");
  return startCreatureRoll(room, "creature");
}

function startCreatureRoll(room: GameRoom, resume: TurnPhase) {
  const faces: CreatureRoll[] = ["sea-serpent", "sea-serpent", "shark", "shark", "kaiju", "kaiju"];
  const result = faces[Math.floor(Math.random() * faces.length)];
  room.creatureRoll = result;
  recordEvent(room, "creature-die", `生物骰掷出了${creatureName(result)}`, room.currentPlayerId ?? undefined, { result });
  if (room.creatures.some((item) => item.type === result)) {
    room.turnPhase = "creature-move";
    room.creatureMovesRemaining = result === "sea-serpent" ? 1 : 2;
    room.creatureMoved = false;
    room.pendingChoice = {
      type: "move-creature",
      creatureType: result,
      stepsRemaining: room.creatureMovesRemaining,
      canFinish: false
    };
    room.resumePhase = resume;
  } else finishCreatureMove(room);
  bump(room);
  return result;
}

export function moveCreature(room: GameRoom, playerId: string, creatureId: string, targetId: string) {
  requireTurn(room, playerId, "creature-move");
  if (room.pendingChoice?.type !== "move-creature") throw new Error("请先完成当前结算");
  const creature = room.creatures.find((item) => item.id === creatureId);
  const from = creature ? coord(room, creature.locationId) : undefined;
  const to = coord(room, targetId);
  if (!creature || creature.type !== room.pendingChoice?.creatureType) throw new Error("请选择骰子指定的生物");
  if (!from || !to || !areAdjacent(from, to)) throw new Error("生物必须逐格移动");
  if (creature.type !== "kaiju" && !isWater(room, targetId)) throw new Error("该生物只能在水域移动");
  if (room.tiles.find((tile) => tile.id === targetId)?.isRescue) throw new Error("生物不能进入救援岛");
  if (creature.type !== "kaiju" && room.creatures.some((item) => item.type === "kaiju" && item.locationId === targetId)) throw new Error("巨兽阻挡了目标");
  if (creature.type === "kaiju" && room.creatures.some((item) => item.id !== creature.id && item.type === "kaiju" && item.locationId === targetId)) {
    throw new Error("巨兽不能进入另一只巨兽所在格");
  }
  creature.locationId = targetId;
  room.creatureMovesRemaining -= 1;
  room.creatureMoved = true;
  recordEvent(room, "creature-moved", `${creatureName(creature.type)}移动了`, playerId, {
    creatureId, targetId, stepsRemaining: room.creatureMovesRemaining
  });
  if (hasInteractionTarget(room, creature)) {
    room.interactionContinuation = "finish-creature";
    resolveCreatureInteraction(room, creature);
  } else if (room.creatureMovesRemaining <= 0) {
    finishCreatureMove(room);
  } else {
    room.pendingChoice = {
      type: "move-creature",
      creatureType: creature.type,
      creatureId: creature.id,
      stepsRemaining: room.creatureMovesRemaining,
      canFinish: true
    };
  }
  bump(room);
}

export function finishCreatureMovement(room: GameRoom, playerId: string) {
  requireTurn(room, playerId, "creature-move");
  if (room.pendingChoice?.type !== "move-creature" || !room.creatureMoved) throw new Error("这只生物至少要移动一格");
  finishCreatureMove(room);
  bump(room);
}

function finishCreatureMove(room: GameRoom) {
  const resume = room.resumePhase;
  room.pendingChoice = null;
  room.resumePhase = null;
  room.pendingAttack = null;
  room.creatureMovesRemaining = 0;
  room.creatureMoved = false;
  room.interactionContinuation = "none";
  if (resume === "action") room.turnPhase = "action";
  else advanceTurn(room);
}

function hasInteractionTarget(room: GameRoom, creature: CreatureView) {
  const explorers = room.explorers.filter((item) => item.locationId === creature.locationId && !item.lost && !item.rescued);
  if (creature.type === "sea-serpent") return explorers.length > 0 || Boolean(raftAt(room, creature.locationId));
  if (creature.type === "shark") return explorers.some((item) => item.swimming);
  return explorers.length > 0 || Boolean(raftAt(room, creature.locationId)) ||
    room.creatures.some((item) => item.id !== creature.id && item.locationId === creature.locationId);
}

function resolveInteractions(room: GameRoom, locationId: string) {
  const creature = room.creatures.find((item) => item.locationId === locationId && hasInteractionTarget(room, item));
  if (creature) resolveCreatureInteraction(room, creature);
}

function resolveCreatureInteraction(room: GameRoom, creature: CreatureView) {
  if (creature.type === "sea-serpent") {
    eliminateAt(room, creature.locationId, true, true);
    recordEvent(room, "sea-serpent-attack", "海蛇摧毁了该格的木筏和探险者", room.currentPlayerId ?? undefined, {
      creatureId: creature.id, locationId: creature.locationId
    });
    completeInteraction(room);
    return;
  }
  const threatened = room.explorers.filter((item) =>
    item.locationId === creature.locationId && !item.lost && !item.rescued &&
    (creature.type === "kaiju" || item.swimming)
  );
  const responderIds = [...new Set(threatened.map((item) => item.ownerId))]
    .filter((id) => room.players.find((player) => player.id === id)?.abilities.includes("repellent"));
  if (responderIds.length) {
    room.pendingAttack = { creatureId: creature.id, locationId: creature.locationId, responderIds, declinedIds: [] };
    room.pendingChoice = {
      type: "repellent",
      creatureType: creature.type,
      creatureId: creature.id,
      responderIds,
      declinedIds: []
    };
    recordEvent(room, "repellent-window", "生物攻击等待驱逐剂响应", room.currentPlayerId ?? undefined, {
      creatureId: creature.id, responderIds
    });
    return;
  }
  applyCreatureAttack(room, creature);
}

export function respondRepellent(room: GameRoom, playerId: string, use: boolean) {
  const attack = room.pendingAttack;
  if (!attack || room.pendingChoice?.type !== "repellent" || !attack.responderIds.includes(playerId)) {
    throw new Error("你当前不能响应驱逐剂");
  }
  if (attack.declinedIds.includes(playerId)) throw new Error("你已经响应过了");
  const player = room.players.find((item) => item.id === playerId)!;
  if (use) {
    const abilityIndex = player.abilities.indexOf("repellent");
    if (abilityIndex < 0) throw new Error("你没有驱逐剂");
    player.abilities.splice(abilityIndex, 1);
    room.creatures = room.creatures.filter((item) => item.id !== attack.creatureId);
    recordEvent(room, "repellent-used", `${player.name} 使用驱逐剂化解了攻击`, playerId, {
      creatureId: attack.creatureId
    });
    room.pendingAttack = null;
    completeInteraction(room);
  } else {
    attack.declinedIds.push(playerId);
    room.pendingChoice = { ...room.pendingChoice, declinedIds: [...attack.declinedIds] };
    recordEvent(room, "repellent-declined", `${player.name} 放弃使用驱逐剂`, playerId);
    if (attack.responderIds.every((id) => attack.declinedIds.includes(id))) {
      const creature = room.creatures.find((item) => item.id === attack.creatureId);
      room.pendingAttack = null;
      if (creature) applyCreatureAttack(room, creature);
      else completeInteraction(room);
    }
  }
  bump(room);
}

function applyCreatureAttack(room: GameRoom, creature: CreatureView) {
  room.pendingChoice = null;
  if (creature.type === "shark") {
    room.explorers.filter((item) => item.locationId === creature.locationId && item.swimming)
      .forEach((item) => eliminateExplorer(room, item));
    recordEvent(room, "shark-attack", "鲨鱼消灭了该格的游泳者", room.currentPlayerId ?? undefined, {
      creatureId: creature.id, locationId: creature.locationId
    });
    completeInteraction(room);
    return;
  }
  const raft = raftAt(room, creature.locationId);
  if (raft) destroyRaft(room, raft);
  room.displacementQueue = [
    ...room.explorers
      .filter((item) => item.locationId === creature.locationId && !item.lost && !item.rescued)
      .map((item): Displacement => ({ entityId: item.id, entityKind: "explorer" })),
    ...room.creatures
      .filter((item) => item.id !== creature.id && item.locationId === creature.locationId)
      .map((item): Displacement => ({ entityId: item.id, entityKind: "creature" }))
  ];
  recordEvent(room, "kaiju-attack", "巨兽摧毁木筏并开始推离同格单位", room.currentPlayerId ?? undefined, {
    creatureId: creature.id, locationId: creature.locationId
  });
  processNextDisplacement(room);
}

function displacementTargets(room: GameRoom, displacement: Displacement) {
  const entity = displacement.entityKind === "explorer"
    ? room.explorers.find((item) => item.id === displacement.entityId)
    : room.creatures.find((item) => item.id === displacement.entityId);
  if (!entity?.locationId) return [];
  return adjacentIds(room, entity.locationId).filter((id) => {
    const tile = room.tiles.find((item) => item.id === id);
    if (tile?.blocked) return false;
    if (room.creatures.some((item) => item.type === "kaiju" && item.locationId === id)) return false;
    if (displacement.entityKind === "creature") {
      const moved = entity as CreatureView;
      if (tile?.isRescue) return false;
      return moved.type === "kaiju" || isWater(room, id);
    }
    return true;
  });
}

function processNextDisplacement(room: GameRoom) {
  const next = room.displacementQueue[0];
  if (!next) {
    completeInteraction(room);
    return;
  }
  const allowedTargetIds = displacementTargets(room, next);
  if (!allowedTargetIds.length) {
    if (next.entityKind === "explorer") {
      const explorer = room.explorers.find((item) => item.id === next.entityId);
      if (explorer) eliminateExplorer(room, explorer);
    } else {
      room.creatures = room.creatures.filter((item) => item.id !== next.entityId);
    }
    room.displacementQueue.shift();
    processNextDisplacement(room);
    return;
  }
  room.pendingChoice = {
    type: "displace",
    entityId: next.entityId,
    entityKind: next.entityKind,
    allowedTargetIds
  };
}

export function resolveDisplacement(room: GameRoom, playerId: string, targetId: string) {
  requireTurn(room, playerId);
  const pending = room.pendingChoice;
  const displacement = room.displacementQueue[0];
  if (!pending || pending.type !== "displace" || !displacement || !pending.allowedTargetIds?.includes(targetId)) {
    throw new Error("请选择高亮的推离目标");
  }
  if (displacement.entityKind === "explorer") {
    const explorer = room.explorers.find((item) => item.id === displacement.entityId);
    if (explorer) {
      explorer.locationId = explorer.tileId = targetId;
      const raft = raftAt(room, targetId);
      explorer.raftId = raft && occupants(room, raft.id).length < 3 ? raft.id : null;
      explorer.swimming = isWater(room, targetId) && !explorer.raftId;
    }
  } else {
    const creature = room.creatures.find((item) => item.id === displacement.entityId);
    if (creature) creature.locationId = targetId;
  }
  recordEvent(room, "unit-displaced", "巨兽推离了一个单位", playerId, {
    ...displacement, targetId
  });
  room.displacementQueue.shift();
  processNextDisplacement(room);
  bump(room);
}

function completeInteraction(room: GameRoom) {
  room.pendingChoice = null;
  room.pendingAttack = null;
  if (room.interactionContinuation === "displacement" && room.displacementQueue.length) {
    processNextDisplacement(room);
  } else if (room.interactionContinuation === "finish-creature") {
    finishCreatureMove(room);
  } else if (room.turnPhase === "rising") {
    finishRisingStep(room);
  }
}

function eliminateAt(room: GameRoom, locationId: string, explorers: boolean, raft: boolean) {
  if (explorers) room.explorers.filter((item) => item.locationId === locationId && !item.lost && !item.rescued).forEach((item) => eliminateExplorer(room, item));
  if (raft) { const found = raftAt(room, locationId); if (found) destroyRaft(room, found); }
}
function eliminateExplorer(room: GameRoom, explorer: GameExplorer) {
  explorer.lost = true;
  explorer.locationId = explorer.tileId = explorer.raftId = null;
  explorer.swimming = false;
  const player = room.players.find((item) => item.id === explorer.ownerId);
  if (player) player.lost += 1;
}
function destroyRaft(room: GameRoom, raft: RaftView) {
  occupants(room, raft.id).forEach((item) => { item.raftId = null; item.swimming = true; });
  room.rafts = room.rafts.filter((item) => item.id !== raft.id);
}
function autoBoard(room: GameRoom, raft: RaftView) {
  room.explorers.filter((item) => item.locationId === raft.locationId && item.swimming)
    .slice(0, 3 - occupants(room, raft.id).length)
    .forEach((item) => { item.raftId = raft.id; item.swimming = false; });
}

export function resolveBoarding(room: GameRoom, playerId: string, explorerIds: string[]) {
  requireTurn(room, playerId);
  const pending = room.pendingChoice;
  if (pending?.type !== "board-raft" || !pending.raftId || !pending.candidateExplorerIds || pending.maxSelections === undefined) {
    throw new Error("当前没有待选择的登筏者");
  }
  const unique = [...new Set(explorerIds)];
  if (unique.length !== pending.maxSelections || unique.some((id) => !pending.candidateExplorerIds!.includes(id))) {
    throw new Error(`请选择 ${pending.maxSelections} 名探险者登筏`);
  }
  const raft = room.rafts.find((item) => item.id === pending.raftId);
  if (!raft) throw new Error("木筏已经不存在");
  for (const id of unique) {
    const explorer = room.explorers.find((item) => item.id === id && item.locationId === raft.locationId && item.swimming);
    if (!explorer) throw new Error("登筏选择已经失效");
    explorer.raftId = raft.id;
    explorer.swimming = false;
  }
  recordEvent(room, "raft-boarded", "当前玩家选择了登筏者", playerId, {
    raftId: raft.id, explorerIds: unique
  });
  room.pendingChoice = null;
  completeInteraction(room);
  bump(room);
}

export function useAbility(room: GameRoom, playerId: string, ability: AbilityType, actorId?: string, targetId?: string, _secondary?: string) {
  requireTurn(room, playerId);
  const player = room.players.find((item) => item.id === playerId)!;
  const index = player.abilities.indexOf(ability);
  if (index < 0) throw new Error("你没有这张能力");
  if (ability === "repellent") throw new Error("驱逐剂只能在生物攻击响应窗口使用");
  if (room.turnPhase !== "action") throw new Error("这张能力只能在行动阶段使用");
  if (ability === "paddles") {
    const raft = room.rafts.find((item) => item.id === actorId);
    const from = raft ? coord(room, raft.locationId) : undefined;
    const to = targetId ? coord(room, targetId) : undefined;
    if (!raft || !from || !to || !targetId || !controlsRaft(room, playerId, raft) || hexDistance(from, to) > 2 || !isWater(room, targetId) || raftAt(room, targetId)) throw new Error("船桨目标不合法");
    raft.locationId = targetId;
    occupants(room, raft.id).forEach((item) => { item.locationId = item.tileId = targetId; });
    resolveInteractions(room, targetId);
  } else if (ability === "dolphin") {
    const explorer = room.explorers.find((item) => item.id === actorId && item.ownerId === playerId && item.swimming);
    const from = explorer?.locationId ? coord(room, explorer.locationId) : undefined;
    const to = targetId ? coord(room, targetId) : undefined;
    if (!explorer || !from || !to || !targetId || hexDistance(from, to) > 2) throw new Error("海豚目标不合法");
    explorer.locationId = explorer.tileId = targetId;
    const raft = raftAt(room, targetId);
    explorer.raftId = raft && occupants(room, raft.id).length < 3 ? raft.id : null;
    explorer.swimming = isWater(room, targetId) && !explorer.raftId;
  } else if (ability === "dive") {
    const creature = room.creatures.find((item) => item.id === actorId);
    if (!creature || !targetId || !isWater(room, targetId) || room.creatures.some((item) => item.locationId === targetId)) throw new Error("潜水目标不合法");
    creature.locationId = targetId;
  } else if (ability === "creature-die") {
    player.abilities.splice(index, 1);
    startCreatureRoll(room, "action");
    return;
  }
  player.abilities.splice(index, 1);
  recordEvent(room, "ability-used", `${player.name} 使用了${abilityName[ability]}`, playerId, {
    ability, actorId, targetId
  });
  bump(room);
}

function beginTurn(room: GameRoom) {
  room.turnPhase = "action";
  room.actionsLeft = 3;
  room.creatureRoll = null;
  room.pendingChoice = null;
  room.explorers.forEach((item) => { item.swamThisTurn = false; });
  room.turnStartedWithoutExplorers = !room.explorers.some((item) =>
    item.ownerId === room.currentPlayerId && !item.rescued && !item.lost
  );
}
function advanceTurn(room: GameRoom) {
  const index = room.players.findIndex((player) => player.id === room.currentPlayerId);
  const next = (index + 1) % room.players.length;
  if (next === 0) room.round += 1;
  room.currentPlayerId = room.players[next].id;
  beginTurn(room);
  recordEvent(room, "turn-started", `轮到 ${room.players[next].name}`, room.players[next].id, {
    round: room.round,
    turnStartedWithoutExplorers: room.turnStartedWithoutExplorers
  });
  bump(room);
}

export function runAITurn(room: GameRoom) {
  const player = room.players.find((item) => item.id === room.currentPlayerId);
  if (!player?.isAI || room.phase !== "playing") return;
  if (room.turnPhase === "setup-explorer") {
    const target = room.tiles.find((tile) => tile.active && !tile.isRescue && room.explorers.filter((item) => item.locationId === tile.id).length < (room.players.length === 5 && room.setupPlaced >= 40 ? 2 : 1));
    if (target) placeExplorer(room, player.id, target.id);
  } else if (room.turnPhase === "setup-raft") {
    const target = room.waterSpaces.find((space) => !raftAt(room, space.id) && room.tiles.some((tile) => tile.active && !tile.isRescue && areAdjacent(space, tile)));
    if (target) placeRaft(room, player.id, target.id);
  } else if (room.turnPhase === "action") {
    while (room.actionsLeft > 0) {
      const options = room.explorers.filter((item) => item.ownerId === player.id && item.locationId && !item.lost && !item.rescued)
        .flatMap((explorer) => adjacentIds(room, explorer.locationId!).map((targetId) => {
          const target = coord(room, targetId)!;
          const distance = Math.min(...room.tiles.filter((tile) => tile.isRescue).map((rescue) => hexDistance(target, rescue)));
          return { explorer, targetId, score: room.tiles.find((tile) => tile.id === targetId)?.isRescue ? 100 + explorer.value : 20 - distance };
        })).sort((a, b) => b.score - a.score);
      let moved = false;
      for (const option of options) try { moveExplorer(room, player.id, option.explorer.id, option.targetId); moved = true; break; } catch { /* next */ }
      if (!moved || room.phase !== "playing") break;
    }
    if (room.phase === "playing") endTurn(room);
  } else if (room.turnPhase === "rising") {
    const active = room.tiles.filter((tile) => tile.active && !tile.isRescue);
    const rank: Record<Terrain, number> = { beach: 0, forest: 1, mountain: 2 };
    const low = Math.min(...active.map((tile) => rank[tile.terrain]));
    const target = active.filter((tile) => rank[tile.terrain] === low).sort((a, b) =>
      room.explorers.filter((e) => e.locationId === b.id && e.ownerId !== player.id).length -
      room.explorers.filter((e) => e.locationId === a.id && e.ownerId !== player.id).length)[0];
    if (target) sinkChosenTile(room, player.id, target.id);
  } else if (room.turnPhase === "creature") rollCreatureDie(room, player.id);
  else if (room.pendingChoice?.type === "repellent") {
    if (room.pendingChoice.responderIds?.includes(player.id)) respondRepellent(room, player.id, player.aiDifficulty === "strategic");
  } else if (room.pendingChoice?.type === "displace") {
    const targets = room.pendingChoice.allowedTargetIds ?? [];
    const target = targets.sort((a, b) =>
      room.explorers.filter((e) => e.locationId === b && e.ownerId !== player.id).length -
      room.explorers.filter((e) => e.locationId === a && e.ownerId !== player.id).length)[0];
    if (target) resolveDisplacement(room, player.id, target);
  } else if (room.pendingChoice?.type === "board-raft") {
    const candidates = room.pendingChoice.candidateExplorerIds ?? [];
    const count = room.pendingChoice.maxSelections ?? 0;
    const selected = [...candidates].sort((a, b) => {
      const explorerA = room.explorers.find((item) => item.id === a)!;
      const explorerB = room.explorers.find((item) => item.id === b)!;
      const mineA = explorerA.ownerId === player.id ? 1 : 0;
      const mineB = explorerB.ownerId === player.id ? 1 : 0;
      return mineB - mineA;
    }).slice(0, count);
    resolveBoarding(room, player.id, selected);
  } else {
    const lockedId = room.pendingChoice?.creatureId;
    const creature = room.creatures.find((item) => item.id === lockedId) ??
      room.creatures.find((item) => item.type === room.pendingChoice?.creatureType);
    if (!creature) finishCreatureMove(room);
    else {
      const from = coord(room, creature.locationId)!;
      const targets = [...room.tiles, ...room.waterSpaces].filter((space) =>
        areAdjacent(from, space) &&
        !room.tiles.find((tile) => tile.id === space.id)?.isRescue &&
        (creature.type === "kaiju" || isWater(room, space.id)) &&
        !room.creatures.some((item) => item.type === "kaiju" && item.locationId === space.id)
      );
      const target = targets.sort((a, b) =>
        room.explorers.filter((e) => e.locationId === b.id && e.ownerId !== player.id).length -
        room.explorers.filter((e) => e.locationId === a.id && e.ownerId !== player.id).length)[0];
      if (target) moveCreature(room, player.id, creature.id, target.id);
      else if (room.creatureMoved) finishCreatureMovement(room, player.id);
      else finishCreatureMove(room);
    }
  }
}

function checkFinished(room: GameRoom) {
  const remaining = room.explorers.some((item) => !item.rescued && !item.lost);
  if (remaining && room.volcanoes < room.maxVolcanoes) return false;
  room.phase = "finished";
  room.currentPlayerId = null;
  const high = Math.max(...room.players.map((player) => player.score));
  room.winnerIds = room.players.filter((player) => player.score === high).map((player) => player.id);
  recordEvent(room, "game-finished", `远征结束，最高分 ${high}`, undefined, {
    winnerIds: room.winnerIds, scores: room.players.map((player) => ({ id: player.id, score: player.score }))
  });
  bump(room);
  return true;
}

export function publicState(room: GameRoom, viewerId?: string): PublicRoomState {
  const nextPrivateExplorerId = room.turnPhase === "setup-explorer" && room.currentPlayerId === viewerId
    ? room.explorers.find((explorer) => explorer.ownerId === viewerId && !explorer.locationId)?.id
    : undefined;
  return {
    code: room.code, phase: room.phase, hostId: room.hostId, revision: room.revision,
    players: room.players.map((player) => ({ ...player, abilities: player.id === viewerId ? player.abilities : [] })),
    spectators: room.spectators,
    tiles: room.tiles.map(({ effect: _effect, ...tile }) => tile),
    waterSpaces: room.waterSpaces,
    explorers: room.explorers.map((explorer) => ({
      ...explorer,
      value: explorer.rescued || explorer.id === nextPrivateExplorerId ? explorer.value : undefined
    })),
    rafts: room.rafts, creatures: room.creatures,
    currentPlayerId: room.currentPlayerId, turnPhase: room.turnPhase, creatureRoll: room.creatureRoll,
    pendingChoice: room.pendingChoice, actionsLeft: room.actionsLeft, round: room.round,
    volcanoes: room.volcanoes, maxVolcanoes: room.maxVolcanoes, log: room.log.slice(-16),
    events: room.events.slice(-60).map(({ payload: _payload, ...event }) => event), winnerIds: room.winnerIds
  };
}

export const createAIId = () => `ai-${randomUUID()}`;
export function bump(room: GameRoom) { room.revision += 1; }
export function recordEvent(
  room: GameRoom,
  type: string,
  message: string,
  actorId?: string,
  payload?: Record<string, unknown>
) {
  room.log.push(message);
  room.events.push({
    id: (room.events.at(-1)?.id ?? 0) + 1,
    at: new Date().toISOString(),
    type,
    actorId,
    message,
    payload
  });
}
export function nextAIName(room: GameRoom) {
  const names = ["罗盘", "灯塔", "浪花", "火山", "海风"];
  return names.find((name) => !room.players.some((player) => player.name === `AI·${name}`)) ?? `AI·${room.players.length}`;
}
