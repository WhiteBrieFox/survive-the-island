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
  type MapMarkerView,
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
  markers: MapMarkerView[];
  currentPlayerId: string | null;
  turnPhase: TurnPhase;
  creatureRoll: CreatureRoll | null;
  creatureRollId: number;
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
  displacementMode: "choose" | "random";
  interactionContinuation: "none" | "finish-creature" | "displacement";
  postDisplacementContinuation: "none" | "finish-creature";
  reconnectTokens: Record<string, string>;
  spectatorTokens: Record<string, string>;
  aiTimer?: NodeJS.Timeout;
  creatureSkipTimer?: NodeJS.Timeout;
  markerTimer?: NodeJS.Timeout;
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
const EXPLORER_SPACE_CAPACITY = 5;
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
    tiles: [], waterSpaces: [], explorers: [], rafts: [], creatures: [], markers: [],
    currentPlayerId: null, turnPhase: "setup-explorer", creatureRoll: null, creatureRollId: 0, pendingChoice: null,
    actionsLeft: 3, risingRemaining: 1, round: 1, volcanoes: 0, maxVolcanoes: 3,
    log: [], events: [], winnerIds: [], setupPlaced: 0, resumePhase: null,
    creatureMovesRemaining: 0, creatureMoved: false, turnStartedWithoutExplorers: false,
    pendingAttack: null, displacementQueue: [], displacementMode: "choose", interactionContinuation: "none",
    postDisplacementContinuation: "none",
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

function rescueCoords() {
  return [
    { q: -2, r: -6 },
    { q: 8, r: -6 },
    { q: -8, r: 6 },
    { q: 2, r: 6 }
  ];
}

function waterSpaces(tiles: TileView[]) {
  const occupied = new Set(tiles.map(hexKey));
  const result: WaterSpaceView[] = [];
  for (let q = -8; q <= 8; q += 1) for (let r = -8; r <= 8; r += 1) {
    const coord = { q, r };
    if (hexDistance({ q: 0, r: 0 }, coord) <= 8 && !occupied.has(hexKey(coord))) result.push({ ...coord, id: `water-${q}-${r}` });
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
  room.players = shuffle(room.players);
  const kinds = shuffle(TERRAIN);
  const pools = { beach: shuffle(EFFECTS.beach), forest: shuffle(EFFECTS.forest), mountain: shuffle(EFFECTS.mountain) };
  const island: GameTile[] = createIslandCoords(40, { excludeCenter: true }).map((coord, index) => {
    const terrain = kinds[index];
    return { ...coord, id: `tile-${index}`, terrain, active: true, sinking: false, blocked: false, effect: pools[terrain].pop()! };
  });
  const rescues: GameTile[] = rescueCoords().map((coord, index) => ({
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
  const guardedSpaces = rescues.map((rescue) =>
    room.waterSpaces
      .filter((space) => areAdjacent(space, rescue))
      .sort((a, b) => hexDistance({ q: 0, r: 0 }, a) - hexDistance({ q: 0, r: 0 }, b))[0]
  );
  const centerSerpentSpace = room.waterSpaces.find((space) => space.q === 0 && space.r === 0);
  if (!centerSerpentSpace) throw new Error("中央海蛇起始格不存在");
  room.creatures = [...guardedSpaces, centerSerpentSpace].map((space, index) => ({
    id: `sea-serpent-${index}`, type: "sea-serpent", locationId: space.id
  }));
  room.rafts = [];
  room.phase = "playing";
  room.currentPlayerId = room.players[0].id;
  room.turnPhase = "setup-explorer";
  recordEvent(room, "game-started", `${room.players[0].name} 随机成为先手，开始轮流放置探险者`, room.hostId, {
    turnOrder: room.players.map((player) => player.id),
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
function explorersAt(room: GameRoom, locationId: string, excludedIds: string[] = []) {
  const excluded = new Set(excludedIds);
  return room.explorers.filter((explorer) =>
    explorer.locationId === locationId &&
    !explorer.lost &&
    !excluded.has(explorer.id)
  );
}
function hasExplorerCapacity(room: GameRoom, locationId: string, incoming = 1, excludedIds: string[] = []) {
  return explorersAt(room, locationId, excludedIds).length + incoming <= EXPLORER_SPACE_CAPACITY;
}
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
  if (room.creatures.some((item) => item.type === "sea-serpent" && item.locationId === waterId)) {
    throw new Error("海蛇所在水域不能放置木筏");
  }
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

function boardSwimmersAt(room: GameRoom, raft: RaftView, locationId: string) {
  const available = 3 - occupants(room, raft.id).length;
  if (available <= 0) return [];
  const boarded = room.explorers
    .filter((item) => item.locationId === locationId && item.swimming && !item.lost && !item.rescued)
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, available);
  boarded.forEach((item) => {
    item.raftId = raft.id;
    item.swimming = false;
  });
  return boarded.map((item) => item.id);
}

function raftRoute(room: GameRoom, fromId: string, targetId: string, maxDistance: number) {
  const from = coord(room, fromId);
  const target = coord(room, targetId);
  if (!from || !target) throw new Error("木筏目标不合法");
  const distance = hexDistance(from, target);
  if (distance < 1 || distance > maxDistance) throw new Error("木筏目标不合法");
  if (distance === 1) return [targetId];

  const candidates = [...room.tiles, ...room.waterSpaces]
    .filter((space) =>
      areAdjacent(from, space) &&
      areAdjacent(space, target) &&
      isWater(room, space.id) &&
      !raftAt(room, space.id) &&
      !room.creatures.some((item) =>
        (item.type === "kaiju" || item.type === "sea-serpent") &&
        item.locationId === space.id
      )
    )
    .sort((a, b) => {
      const swimmersA = room.explorers.filter((item) => item.locationId === a.id && item.swimming).length;
      const swimmersB = room.explorers.filter((item) => item.locationId === b.id && item.swimming).length;
      return swimmersB - swimmersA || a.id.localeCompare(b.id);
    });
  if (!candidates.length) throw new Error("木筏没有可通过的航线");
  return [candidates[0].id, targetId];
}

function sailRaft(room: GameRoom, raft: RaftView, route: string[]) {
  const boardedExplorerIds: string[] = [];
  const aboardIds = occupants(room, raft.id).map((explorer) => explorer.id);
  if (route.some((locationId) => !hasExplorerCapacity(room, locationId, aboardIds.length, aboardIds))) {
    throw new Error("目标格最多容纳 5 名探险者");
  }
  for (const locationId of route) {
    raft.locationId = locationId;
    occupants(room, raft.id).forEach((explorer) => {
      explorer.locationId = locationId;
      explorer.tileId = locationId;
    });
    boardedExplorerIds.push(...boardSwimmersAt(room, raft, locationId));
  }
  return boardedExplorerIds;
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
  if (targetTile?.isRescue && !explorer.raftId) throw new Error("必须乘木筏抵达救援岛");
  if (!targetTile?.isRescue && !hasExplorerCapacity(room, targetId, 1, [explorer.id])) {
    throw new Error("目标格最多容纳 5 名探险者");
  }
  const destinationRaft = raftAt(room, targetId);
  if (destinationRaft && occupants(room, destinationRaft.id).length >= 3) throw new Error("木筏已经满员");
  const sourceStable = Boolean(explorer.raftId || room.tiles.some((tile) => tile.id === explorer.locationId && tile.active));
  const targetStable = Boolean(destinationRaft || targetTile?.active);
  const swims = !sourceStable || !targetStable;
  if (swims && explorer.swamThisTurn) throw new Error("这名探险者本回合已经游过一次");
  const sourceId = explorer.locationId;
  explorer.locationId = targetId;
  explorer.tileId = targetId;
  explorer.raftId = destinationRaft?.id ?? null;
  explorer.swimming = isWater(room, targetId) && !destinationRaft;
  if (swims) explorer.swamThisTurn = true;
  room.actionsLeft -= 1;
  const player = room.players.find((item) => item.id === playerId)!;
  if (targetTile?.isRescue) {
    explorer.locationId = null;
    explorer.tileId = null;
    explorer.raftId = null;
    explorer.swimming = false;
    explorer.rescued = true;
    player.score += explorer.value;
    player.rescued += 1;
    recordEvent(room, "explorer-rescued", `${player.name} 救出探险者，获得 ${explorer.value} 分`, playerId, {
      explorerId, sourceId, targetId, value: explorer.value
    });
  } else {
    recordEvent(room, swims ? "swimmer-moved" : "explorer-moved", `${player.name} 移动了一名探险者`, playerId, {
      explorerId, sourceId, targetId
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
  const sourceId = raft.locationId;
  const route = raftRoute(room, sourceId, targetId, 1);
  const boardedExplorerIds = sailRaft(room, raft, route);
  if (!free) room.actionsLeft -= 1;
  resolveInteractions(room, targetId);
  recordEvent(room, "raft-moved", boardedExplorerIds.length ? `木筏移动并救起 ${boardedExplorerIds.length} 名落水者` : "木筏移动了", playerId, {
    raftId, sourceId, targetId, free, route, boardedExplorerIds
  });
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
    [tile.id, ...adjacentIds(room, tile.id)].forEach((id) => {
      eliminateAt(room, id, true, true);
      room.creatures = room.creatures.filter((item) => item.locationId !== id);
    });
    recordEvent(room, "whirlpool", "漩涡吞噬了中心及周围一格内的一切", playerId, { tileId: tile.id });
  } else if (tile.effect === "shark" || tile.effect === "kaiju") {
    const creature = spawnCreature(room, tile.effect, tile.id);
    if (hasInteractionTarget(room, creature)) resolveCreatureInteraction(room, creature, tile.effect === "kaiju" ? "random" : "choose");
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
    recordEvent(room, "ability-drawn", `${player.name} 获得了一张能力牌`, playerId, {
      ability: tile.effect
    });
  }
}

function spawnCreature(room: GameRoom, type: CreatureType, locationId: string) {
  const limit = type === "shark" ? 6 : 2;
  if (type === "kaiju") room.creatures = room.creatures.filter((item) => !(item.type === "kaiju" && item.locationId === locationId));
  const same = room.creatures.filter((item) => item.type === type);
  const creature = same.length >= limit
    ? same[0]
    : { id: `${type}-${randomUUID()}`, type, locationId };
  creature.locationId = locationId;
  if (!room.creatures.includes(creature)) room.creatures.push(creature);
  recordEvent(room, "creature-spawned", `${creatureName(type)}出现了`, room.currentPlayerId ?? undefined, {
    type, locationId
  });
  return creature;
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
  room.creatureRollId = room.events.at(-1)?.id ?? room.creatureRollId + 1;
  const matchingCreatures = room.creatures.filter((item) => item.type === result);
  if (matchingCreatures.some((item) => legalCreatureTargetIds(room, item).length > 0)) {
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
  } else {
    room.turnPhase = "creature-move";
    room.creatureMovesRemaining = 0;
    room.creatureMoved = false;
    room.pendingChoice = {
      type: "move-creature",
      creatureType: result,
      stepsRemaining: 0,
      canFinish: true,
      autoSkipReason: matchingCreatures.length ? "blocked" : "missing"
    };
    room.resumePhase = resume;
  }
  bump(room);
  return result;
}

export function moveCreature(room: GameRoom, playerId: string, creatureId: string, targetId: string) {
  requireTurn(room, playerId, "creature-move");
  if (room.pendingChoice?.type !== "move-creature") throw new Error("请先完成当前结算");
  const creature = room.creatures.find((item) => item.id === creatureId);
  if (!creature || creature.type !== room.pendingChoice?.creatureType) throw new Error("请选择骰子指定的生物");
  const route = creatureRoute(room, creature, targetId, room.creatureMovesRemaining);
  if (!route) throw new Error("目标不在本次可移动范围内");
  const sourceId = creature.locationId;
  const traversed: string[] = [];
  for (const locationId of route) {
    creature.locationId = locationId;
    traversed.push(locationId);
    room.creatureMovesRemaining -= 1;
    room.creatureMoved = true;
    if (hasInteractionTarget(room, creature)) break;
  }
  recordEvent(room, "creature-moved", `${creatureName(creature.type)}移动了`, playerId, {
    creatureId,
    sourceId,
    targetId: creature.locationId,
    route: traversed,
    stepsRemaining: room.creatureMovesRemaining
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
  if (room.pendingChoice?.type !== "move-creature") throw new Error("当前没有待移动的生物");
  if (!room.creatureMoved) {
    const creatureType = room.pendingChoice.creatureType!;
    const movable = room.creatures.some((creature) =>
      creature.type === creatureType && legalCreatureTargetIds(room, creature).length > 0
    );
    recordEvent(
      room,
      "creature-skipped",
      movable
        ? `玩家主动跳过了${creatureName(creatureType)}移动`
        : `场上没有可移动的${creatureName(creatureType)}，本次跳过`,
      playerId
    );
  }
  finishCreatureMove(room);
  bump(room);
}

function legalCreatureTargetIds(room: GameRoom, creature: CreatureView) {
  return legalCreatureTargetIdsFrom(room, creature, creature.locationId);
}

function legalCreatureTargetIdsFrom(room: GameRoom, creature: CreatureView, fromId: string) {
  const from = coord(room, fromId);
  if (!from) return [];
  return [...room.tiles, ...room.waterSpaces].filter((target) => {
    if (!areAdjacent(from, target)) return false;
    const targetTile = room.tiles.find((tile) => tile.id === target.id);
    if (targetTile?.isRescue) return false;
    if (creature.type !== "kaiju" && !isWater(room, target.id)) return false;
    if (creature.type !== "kaiju" && room.creatures.some((item) => item.type === "kaiju" && item.locationId === target.id)) return false;
    if (creature.type === "kaiju" && room.creatures.some((item) =>
      item.id !== creature.id && item.type === "kaiju" && item.locationId === target.id
    )) return false;
    return true;
  }).map((target) => target.id);
}

function creatureRoute(room: GameRoom, creature: CreatureView, targetId: string, maxSteps: number) {
  if (targetId === creature.locationId || maxSteps < 1) return null;
  const queue: Array<{ locationId: string; route: string[] }> = [{ locationId: creature.locationId, route: [] }];
  const visited = new Set([creature.locationId]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.route.length >= maxSteps) continue;
    for (const nextId of legalCreatureTargetIdsFrom(room, creature, current.locationId)) {
      if (visited.has(nextId)) continue;
      const route = [...current.route, nextId];
      if (nextId === targetId) return route;
      visited.add(nextId);
      if (hasInteractionTargetAt(room, creature, nextId)) continue;
      queue.push({ locationId: nextId, route });
    }
  }
  return null;
}

export function setMapMarker(room: GameRoom, playerId: string, locationId: string | null) {
  const player = room.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error("只有玩家可以放置标记");
  const existing = room.markers.find((marker) => marker.playerId === playerId);
  if (locationId !== null && !coord(room, locationId)) throw new Error("标记位置不存在");
  room.markers = room.markers.filter((marker) => marker.playerId !== playerId);
  if (locationId !== null && existing?.locationId !== locationId) {
    room.markers.push({ playerId, locationId, expiresAt: Date.now() + 6000 });
  }
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
  return hasInteractionTargetAt(room, creature, creature.locationId);
}

function hasInteractionTargetAt(room: GameRoom, creature: CreatureView, locationId: string) {
  const explorers = room.explorers.filter((item) => item.locationId === locationId && !item.lost && !item.rescued);
  if (creature.type === "sea-serpent") return explorers.length > 0 || Boolean(raftAt(room, locationId));
  if (creature.type === "shark") return explorers.some((item) => item.swimming);
  return explorers.length > 0 || Boolean(raftAt(room, locationId)) ||
    room.creatures.some((item) => item.id !== creature.id && item.locationId === locationId);
}

function dolphinRoute(room: GameRoom, explorer: GameExplorer, targetId: string) {
  if (!explorer.locationId) return null;
  const from = coord(room, explorer.locationId);
  const target = coord(room, targetId);
  if (!from || !target) return null;
  const distance = hexDistance(from, target);
  if (distance < 1 || distance > 2) return null;
  if (distance === 1) return [targetId];

  const middle = [...room.tiles, ...room.waterSpaces]
    .filter((space) =>
      areAdjacent(from, space) &&
      areAdjacent(space, target) &&
      isWater(room, space.id) &&
      !raftAt(room, space.id) &&
      !room.creatures.some((creature) => creature.locationId === space.id) &&
      hasExplorerCapacity(room, space.id, 1, [explorer.id])
    )
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  return middle ? [middle.id, targetId] : null;
}

function resolveInteractions(room: GameRoom, locationId: string) {
  const creature = room.creatures.find((item) => item.locationId === locationId && hasInteractionTarget(room, item));
  if (creature) resolveCreatureInteraction(room, creature);
}

function resolveCreatureInteraction(
  room: GameRoom,
  creature: CreatureView,
  displacementMode: GameRoom["displacementMode"] = "choose"
) {
  room.displacementMode = displacementMode;
  if (creature.type === "sea-serpent") {
    const affectedExplorerIds = room.explorers
      .filter((item) => item.locationId === creature.locationId && !item.lost && !item.rescued)
      .map((item) => item.id);
    const destroyedRaftId = raftAt(room, creature.locationId)?.id;
    eliminateAt(room, creature.locationId, true, true);
    recordEvent(room, "sea-serpent-attack", "海蛇摧毁了该格的木筏和探险者", room.currentPlayerId ?? undefined, {
      creatureId: creature.id, locationId: creature.locationId, affectedExplorerIds, destroyedRaftId
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
    const affected = room.explorers.filter((item) => item.locationId === creature.locationId && item.swimming);
    affected.forEach((item) => eliminateExplorer(room, item));
    recordEvent(room, "shark-attack", "鲨鱼消灭了该格的游泳者", room.currentPlayerId ?? undefined, {
      creatureId: creature.id, locationId: creature.locationId, affectedExplorerIds: affected.map((item) => item.id)
    });
    completeInteraction(room);
    return;
  }
  const raft = raftAt(room, creature.locationId);
  const destroyedRaftId = raft?.id;
  if (raft) destroyRaft(room, raft);
  room.postDisplacementContinuation = room.interactionContinuation === "finish-creature"
    ? "finish-creature"
    : "none";
  room.interactionContinuation = "displacement";
  room.displacementQueue = [
    ...room.explorers
      .filter((item) => item.locationId === creature.locationId && !item.lost && !item.rescued)
      .map((item): Displacement => ({ entityId: item.id, entityKind: "explorer" })),
    ...room.creatures
      .filter((item) => item.id !== creature.id && item.locationId === creature.locationId)
      .map((item): Displacement => ({ entityId: item.id, entityKind: "creature" }))
  ];
  recordEvent(room, "kaiju-attack", "巨兽摧毁木筏并开始推离同格单位", room.currentPlayerId ?? undefined, {
    creatureId: creature.id, locationId: creature.locationId, displacementMode: room.displacementMode, destroyedRaftId
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
    if (tile?.isRescue) return false;
    if (room.creatures.some((item) => item.type === "kaiju" && item.locationId === id)) return false;
    if (displacement.entityKind === "creature") {
      const moved = entity as CreatureView;
      if (tile?.isRescue) return false;
      return moved.type === "kaiju" || isWater(room, id);
    }
    return hasExplorerCapacity(room, id);
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
  if (room.displacementMode === "random") {
    room.displacementQueue.shift();
    const targetId = allowedTargetIds[Math.floor(Math.random() * allowedTargetIds.length)];
    const interactionStarted = moveDisplacedEntity(room, next, targetId);
    if (!interactionStarted) processNextDisplacement(room);
    return;
  }
  room.pendingChoice = {
    type: "displace",
    entityId: next.entityId,
    entityKind: next.entityKind,
    allowedTargetIds
  };
}

function moveDisplacedEntity(room: GameRoom, displacement: Displacement, targetId: string) {
  let interactionStarted = false;
  let sourceId: string | null = null;
  if (displacement.entityKind === "explorer") {
    const explorer = room.explorers.find((item) => item.id === displacement.entityId);
    if (explorer) {
      sourceId = explorer.locationId;
      explorer.locationId = explorer.tileId = targetId;
      const raft = raftAt(room, targetId);
      explorer.raftId = raft && occupants(room, raft.id).length < 3 ? raft.id : null;
      explorer.swimming = isWater(room, targetId) && !explorer.raftId;
      const creature = room.creatures.find((item) => item.locationId === targetId && hasInteractionTarget(room, item));
      if (creature) {
        interactionStarted = true;
        resolveCreatureInteraction(room, creature);
      }
    }
  } else {
    const creature = room.creatures.find((item) => item.id === displacement.entityId);
    if (creature) {
      sourceId = creature.locationId;
      creature.locationId = targetId;
    }
  }
  recordEvent(room, "unit-displaced", "巨兽推离了一个单位", room.currentPlayerId ?? undefined, {
    ...displacement, sourceId, targetId, random: room.displacementMode === "random"
  });
  return interactionStarted;
}

export function resolveDisplacement(room: GameRoom, playerId: string, targetId: string) {
  requireTurn(room, playerId);
  const pending = room.pendingChoice;
  const displacement = room.displacementQueue[0];
  if (!pending || pending.type !== "displace" || !displacement || !pending.allowedTargetIds?.includes(targetId)) {
    throw new Error("请选择高亮的推离目标");
  }
  room.displacementQueue.shift();
  const interactionStarted = moveDisplacedEntity(room, displacement, targetId);
  if (!interactionStarted) processNextDisplacement(room);
  bump(room);
}

function completeInteraction(room: GameRoom) {
  room.pendingChoice = null;
  room.pendingAttack = null;
  if (room.interactionContinuation === "displacement") {
    if (room.displacementQueue.length) {
      processNextDisplacement(room);
      return;
    }
    room.interactionContinuation = room.postDisplacementContinuation;
    room.postDisplacementContinuation = "none";
  }
  room.displacementMode = "choose";
  if (room.interactionContinuation === "finish-creature") {
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
    if (!raft || !from || !to || !targetId || !controlsRaft(room, playerId, raft) ||
      hexDistance(from, to) < 1 || hexDistance(from, to) > 2 ||
      !isWater(room, targetId) || raftAt(room, targetId) ||
      room.creatures.some((item) => item.type === "kaiju" && item.locationId === targetId)) {
      throw new Error("船桨目标不合法");
    }
    const route = raftRoute(room, raft.locationId, targetId, 2);
    const boardedExplorerIds = sailRaft(room, raft, route);
    resolveInteractions(room, targetId);
    if (boardedExplorerIds.length) {
      recordEvent(room, "raft-rescue", `木筏沿途救起 ${boardedExplorerIds.length} 名落水者`, playerId, {
        raftId: raft.id, route, boardedExplorerIds
      });
    }
  } else if (ability === "dolphin") {
    const explorer = room.explorers.find((item) => item.id === actorId && item.ownerId === playerId && item.swimming);
    const to = targetId ? coord(room, targetId) : undefined;
    const targetTile = targetId ? room.tiles.find((tile) => tile.id === targetId) : undefined;
    const targetRaft = targetId ? raftAt(room, targetId) : undefined;
    const route = explorer && targetId ? dolphinRoute(room, explorer, targetId) : null;
    if (!explorer || !to || !targetId || !route ||
      targetTile?.isRescue || targetTile?.blocked ||
      room.creatures.some((creature) => creature.type === "kaiju" && creature.locationId === targetId) ||
      !hasExplorerCapacity(room, targetId, 1, [explorer.id]) ||
      Boolean(targetRaft && occupants(room, targetRaft.id).length >= 3)) {
      throw new Error("海豚目标不合法或路径被阻挡");
    }
    explorer.locationId = explorer.tileId = targetId;
    explorer.raftId = targetRaft?.id ?? null;
    explorer.swimming = isWater(room, targetId) && !explorer.raftId;
    resolveInteractions(room, targetId);
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
    const target = room.waterSpaces.find((space) =>
      !raftAt(room, space.id) &&
      !room.creatures.some((creature) =>
        creature.type === "sea-serpent" && creature.locationId === space.id
      ) &&
      room.tiles.some((tile) => tile.active && !tile.isRescue && areAdjacent(space, tile))
    );
    if (target) placeRaft(room, player.id, target.id);
  } else if (room.turnPhase === "action") {
    while (room.actionsLeft > 0) {
      const rescueMove = room.explorers
        .filter((item) => item.ownerId === player.id && item.locationId && item.raftId && !item.lost && !item.rescued)
        .flatMap((explorer) => room.tiles
          .filter((tile) =>
            tile.isRescue &&
            areAdjacent(coord(room, explorer.locationId!)!, tile) &&
            hasExplorerCapacity(room, tile.id, 1, [explorer.id])
          )
          .map((tile) => ({ explorer, targetId: tile.id })))
        .sort((a, b) => b.explorer.value - a.explorer.value)[0];
      if (rescueMove) {
        moveExplorer(room, player.id, rescueMove.explorer.id, rescueMove.targetId);
        if (room.phase !== "playing") break;
        continue;
      }

      const raftMove = room.rafts
        .filter((raft) => controlsRaft(room, player.id, raft) && occupants(room, raft.id).some((item) => item.ownerId === player.id))
        .flatMap((raft) => {
          const from = coord(room, raft.locationId);
          if (!from) return [];
          return [...room.waterSpaces, ...room.tiles.filter((tile) => !tile.active && !tile.blocked)]
            .filter((target) => areAdjacent(from, target) && !raftAt(room, target.id) &&
              !room.creatures.some((creature) => creature.type === "kaiju" && creature.locationId === target.id) &&
              hasExplorerCapacity(
                room,
                target.id,
                occupants(room, raft.id).length,
                occupants(room, raft.id).map((explorer) => explorer.id)
              ))
            .map((target) => ({
              raft,
              targetId: target.id,
              distance: Math.min(...room.tiles.filter((tile) => tile.isRescue).map((rescue) => hexDistance(target, rescue)))
            }));
        })
        .sort((a, b) => a.distance - b.distance)[0];
      if (raftMove) {
        moveRaft(room, player.id, raftMove.raft.id, raftMove.targetId);
        if (room.phase !== "playing") break;
        continue;
      }

      const options = room.explorers.filter((item) => item.ownerId === player.id && item.locationId && !item.raftId && !item.lost && !item.rescued)
        .flatMap((explorer) => adjacentIds(room, explorer.locationId!).map((targetId) => {
          const target = coord(room, targetId)!;
          const distance = Math.min(...room.tiles.filter((tile) => tile.isRescue).map((rescue) => hexDistance(target, rescue)));
          const boardsRaft = Boolean(raftAt(room, targetId));
          return { explorer, targetId, score: boardsRaft ? 80 + explorer.value : 20 - distance };
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
  const placementValuesVisible = room.turnPhase === "setup-explorer" || room.turnPhase === "setup-raft";
  return {
    code: room.code, phase: room.phase, hostId: room.hostId, revision: room.revision,
    players: room.players.map((player) => ({ ...player, abilities: player.id === viewerId ? player.abilities : [] })),
    spectators: room.spectators,
    tiles: room.tiles.map(({ effect, ...tile }) => ({
      ...tile,
      revealedEffect: !tile.active && (effect === "volcano" || effect === "whirlpool") ? effect : undefined
    })),
    waterSpaces: room.waterSpaces,
    explorers: room.explorers.map((explorer) => ({
      ...explorer,
      value: explorer.rescued || (placementValuesVisible && explorer.ownerId === viewerId)
        ? explorer.value
        : undefined
    })),
    rafts: room.rafts,
    creatures: room.creatures,
    markers: room.markers.filter((marker) => marker.expiresAt > Date.now()),
    currentPlayerId: room.currentPlayerId, turnPhase: room.turnPhase,
    creatureRoll: room.creatureRoll, creatureRollId: room.creatureRollId,
    pendingChoice: room.pendingChoice, actionsLeft: room.actionsLeft, round: room.round,
    volcanoes: room.volcanoes, maxVolcanoes: room.maxVolcanoes, log: room.log.slice(-16),
    events: room.events.slice(-60).map(({ payload, ...event }) => ({
      ...event,
      detail: publicEventDetail(room, event, payload)
    })), winnerIds: room.winnerIds
  };
}

function publicEventDetail(
  room: GameRoom,
  event: Omit<GameEventView, "payload">,
  payload?: Record<string, unknown>
) {
  const actor = room.players.find((player) => player.id === event.actorId)?.name ?? "系统";
  const stringValue = (key: string) => typeof payload?.[key] === "string" ? payload[key] as string : undefined;
  const stringValues = (key: string) => Array.isArray(payload?.[key])
    ? (payload[key] as unknown[]).filter((value): value is string => typeof value === "string")
    : [];
  const spaceName = (id?: string) => {
    if (!id) return "未知位置";
    const tile = room.tiles.find((item) => item.id === id);
    const water = room.waterSpaces.find((item) => item.id === id);
    const space = tile ?? water;
    if (!space) return "未知位置";
    const coordinates = `[${space.q}, ${space.r}]`;
    if (!tile) return `水域 ${coordinates}`;
    if (tile.isRescue) return `救援岛 ${coordinates}`;
    const terrain = tile.terrain === "beach" ? "海滩" : tile.terrain === "forest" ? "森林" : "山地";
    return `${tile.active ? terrain : `原${terrain}水域`} ${coordinates}`;
  };
  const explorerName = (id?: string) => {
    const explorer = room.explorers.find((item) => item.id === id);
    if (!explorer) return "未知探险者";
    const owner = room.players.find((player) => player.id === explorer.ownerId);
    const owned = room.explorers.filter((item) => item.ownerId === explorer.ownerId);
    return `${owner?.name ?? "未知玩家"}的第 ${owned.findIndex((item) => item.id === id) + 1} 名探险者`;
  };
  const creatureNameById = (id?: string) => {
    const creature = room.creatures.find((item) => item.id === id);
    if (creature) return creatureName(creature.type);
    if (id?.startsWith("sea-serpent")) return "海蛇";
    if (id?.startsWith("shark")) return "鲨鱼";
    if (id?.startsWith("kaiju")) return "巨兽";
    return "生物";
  };
  const explorerList = (ids: string[]) => ids.length
    ? ids.map(explorerName).join("、")
    : "没有探险者";
  const sourceId = stringValue("sourceId");
  const targetId = stringValue("targetId");

  switch (event.type) {
    case "room-created":
      return `${actor} 创建了房间 ${room.code}，等待其他玩家或 AI 加入。`;
    case "player-joined":
      return `${actor} 加入远征队，当前共有 ${room.players.length} 个玩家席位。`;
    case "spectator-joined":
      return `${actor} 加入观战，不占用玩家席位。`;
    case "game-started":
      return "远征开始，所有玩家依次放置探险者。探险者宝藏价值仅对其所属玩家可见。";
    case "explorer-placed":
      return `${actor} 将 ${explorerName(stringValue("explorerId"))} 放置在 ${spaceName(stringValue("tileId"))}。`;
    case "setup-rafts":
      return "全部探险者已经放置完毕，开始依次在岛屿相邻水域放置木筏。";
    case "raft-placed":
      return `${actor} 在 ${spaceName(stringValue("waterId"))} 放置了一艘木筏。`;
    case "turns-started":
      return "初始木筏全部放置完毕，正式回合开始。每位玩家依次行动、水位上涨并移动生物。";
    case "explorer-moved":
      return `${actor} 操作 ${explorerName(stringValue("explorerId"))}，从 ${spaceName(sourceId)} 步行到 ${spaceName(targetId)}，消耗 1 个行动点。`;
    case "swimmer-moved":
      return `${actor} 操作 ${explorerName(stringValue("explorerId"))}，从 ${spaceName(sourceId)} 游到 ${spaceName(targetId)}；该探险者本回合不能再次游泳移动。`;
    case "explorer-rescued":
      return `${actor} 让 ${explorerName(stringValue("explorerId"))} 从 ${spaceName(sourceId)} 抵达 ${spaceName(targetId)}并获救。宝藏分值仅对所属玩家公开。`;
    case "raft-moved": {
      const boarded = stringValues("boardedExplorerIds");
      return `${actor} 将木筏从 ${spaceName(sourceId)} 移动到 ${spaceName(targetId)}${boarded.length ? `，沿途接上了 ${explorerList(boarded)}` : "，途中没有新的落水者登船"}。`;
    }
    case "action-ended":
      return `${actor} 结束行动阶段，接下来必须翻开当前最低地势。`;
    case "tile-sunk":
      return `${actor} 翻开了 ${spaceName(stringValue("tileId"))}。地块沉入水中，随后结算其背面效果。`;
    case "volcano":
      return `${spaceName(stringValue("tileId"))} 爆发火山；火山进度变为 ${room.volcanoes}/${room.maxVolcanoes}。`;
    case "whirlpool":
      return `${spaceName(stringValue("tileId"))} 出现漩涡，吞噬中心格及周围一格内的探险者、木筏和生物。`;
    case "raft-revealed":
      return `${spaceName(stringValue("tileId"))} 沉没后浮出一艘木筏；同格落水者会在容量允许时登船。`;
    case "ability-drawn":
      return `${actor} 从沉没地块获得一张能力牌。牌面内容只对该玩家公开。`;
    case "ability-used":
      return `${actor} 使用了一张能力牌，并完成了对应的移动或结算。`;
    case "creature-die":
      return `${actor} 掷出生物骰：${creatureName(payload?.result as CreatureType)}。`;
    case "creature-phase":
      return `${actor} 已完成水位上涨结算，现在需要掷生物骰并决定对应生物的移动。`;
    case "creature-moved":
      return `${actor} 将 ${creatureNameById(stringValue("creatureId"))} 从 ${spaceName(sourceId)} 移动到 ${spaceName(targetId)}。`;
    case "creature-spawned":
      return `${creatureName(payload?.type as CreatureType)} 在 ${spaceName(stringValue("locationId"))} 出现，并立即检查同格攻击。`;
    case "creature-skipped":
      return `${actor} 跳过了本次生物移动；可能是主动结束，也可能是场上没有合法目标。`;
    case "repellent-window":
      return `${creatureNameById(stringValue("creatureId"))} 即将攻击，拥有驱逐剂的受威胁玩家可以响应。海蛇攻击不会进入该窗口。`;
    case "repellent-used":
      return `${actor} 使用驱逐剂移除了 ${creatureNameById(stringValue("creatureId"))}，本次攻击被取消。`;
    case "repellent-declined":
      return `${actor} 放弃使用驱逐剂；若其他受威胁玩家也放弃，攻击将继续结算。`;
    case "shark-attack": {
      const affected = stringValues("affectedExplorerIds");
      return `鲨鱼在 ${spaceName(stringValue("locationId"))} 发动攻击，${affected.length ? `${explorerList(affected)} 失踪` : "没有游泳者受到伤害"}。木筏乘员不受影响。`;
    }
    case "sea-serpent-attack": {
      const affected = stringValues("affectedExplorerIds");
      return `海蛇在 ${spaceName(stringValue("locationId"))} 直接攻击，摧毁同格木筏并使 ${explorerList(affected)} 失踪。海蛇不能被驱逐剂阻止。`;
    }
    case "kaiju-attack":
      return `巨兽在 ${spaceName(stringValue("locationId"))} 撞击，摧毁同格木筏，并开始逐个推离同格探险者和生物。`;
    case "unit-displaced": {
      const entity = payload?.entityKind === "explorer"
        ? explorerName(stringValue("entityId"))
        : creatureNameById(stringValue("entityId"));
      return `巨兽将 ${entity} 从 ${spaceName(sourceId)} 推到 ${spaceName(targetId)}；方向由${payload?.random ? "系统随机" : "当前玩家选择"}。到达后立即检查登船或生物攻击。`;
    }
    case "raft-boarded":
      return `${actor} 选择 ${explorerList(stringValues("explorerIds"))} 登上同格木筏。`;
    case "raft-rescue":
      return `${actor} 的木筏沿航线接上了 ${explorerList(stringValues("boardedExplorerIds"))}。`;
    case "turn-started":
      return `第 ${String(payload?.round ?? room.round)} 轮由 ${actor} 开始行动，获得 3 个行动点。`;
    case "game-finished":
      return `远征结束，最高分为 ${String(payload?.high ?? "") || "已结算"}；并列最高分玩家共同获胜。`;
    default:
      return event.message;
  }
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
