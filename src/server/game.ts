import { randomUUID } from "node:crypto";
import { areAdjacent, createIslandCoords, hexDistance, hexKey } from "../shared/hex";
import {
  PLAYER_COLORS,
  type ExplorerView,
  type PlayerColor,
  type PlayerView,
  type PublicRoomState,
  type SpectatorView,
  type Terrain,
  type TileView
} from "../shared/types";

type HiddenEffect = "none" | "volcano";

interface GameTile extends TileView {
  hiddenEffect: HiddenEffect;
}

interface GameExplorer extends ExplorerView {
  value: number;
}

export interface GameRoom {
  code: string;
  phase: PublicRoomState["phase"];
  hostId: string;
  revision: number;
  players: PlayerView[];
  spectators: SpectatorView[];
  tiles: GameTile[];
  explorers: GameExplorer[];
  currentPlayerId: string | null;
  turnPhase: PublicRoomState["turnPhase"];
  creatureRoll: PublicRoomState["creatureRoll"];
  actionsLeft: number;
  round: number;
  volcanoes: number;
  maxVolcanoes: number;
  log: string[];
  winnerIds: string[];
  aiTimer?: NodeJS.Timeout;
}

const TREASURE_VALUES = [1, 1, 1, 2, 2, 2, 3, 3, 4, 5];
const TERRAIN_ORDER: Terrain[] = [
  ...Array<Terrain>(16).fill("beach"),
  ...Array<Terrain>(16).fill("forest"),
  ...Array<Terrain>(8).fill("mountain")
];

const shuffle = <T>(items: T[]) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
};

function chooseRescueCoords(island: TileView[]) {
  const occupied = new Set(island.map(hexKey));
  const candidates = new Map<string, { q: number; r: number }>();
  const directions = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 }
  ];

  for (const tile of island) {
    for (const direction of directions) {
      const coord = { q: tile.q + direction.q, r: tile.r + direction.r };
      if (!occupied.has(hexKey(coord))) candidates.set(hexKey(coord), coord);
    }
  }

  const targets = [-2.35, -0.78, 0.78, 2.35];
  const pool = [...candidates.values()];
  return targets.map((target) => {
    const selected = pool
      .map((coord) => {
        const angle = Math.atan2(coord.r, coord.q);
        const angleDelta = Math.abs(Math.atan2(Math.sin(angle - target), Math.cos(angle - target)));
        return { coord, score: angleDelta - hexDistance({ q: 0, r: 0 }, coord) * 0.03 };
      })
      .sort((a, b) => a.score - b.score)[0].coord;
    pool.splice(
      pool.findIndex((coord) => hexKey(coord) === hexKey(selected)),
      1
    );
    return selected;
  });
}

export function createRoom(code: string, hostId: string, hostName: string): GameRoom {
  return {
    code,
    phase: "lobby",
    hostId,
    revision: 0,
    players: [
      {
        id: hostId,
        name: hostName,
        color: PLAYER_COLORS[0],
        isAI: false,
        connected: true,
        ready: false,
        score: 0,
        rescued: 0,
        lost: 0
      }
    ],
    spectators: [],
    tiles: [],
    explorers: [],
    currentPlayerId: null,
    turnPhase: "action",
    creatureRoll: null,
    actionsLeft: 3,
    round: 1,
    volcanoes: 0,
    maxVolcanoes: 3,
    log: [`${hostName} 创建了房间`],
    winnerIds: []
  };
}

export function addPlayer(room: GameRoom, id: string, name: string, isAI = false) {
  if (room.phase !== "lobby") throw new Error("游戏已经开始，只能加入观战");
  if (room.players.length >= 5) throw new Error("玩家席位已满");
  const color = PLAYER_COLORS.find((candidate) => !room.players.some((player) => player.color === candidate));
  if (!color) throw new Error("没有可用颜色");
  room.players.push({
    id,
    name,
    color,
    isAI,
    connected: true,
    ready: isAI,
    score: 0,
    rescued: 0,
    lost: 0
  });
  room.log.push(`${name}${isAI ? "（AI）" : ""} 加入了远征`);
  bump(room);
}

export function addSpectator(room: GameRoom, id: string, name: string) {
  room.spectators.push({ id, name, connected: true });
  room.log.push(`${name} 开始观战`);
  bump(room);
}

export function startGame(room: GameRoom) {
  if (room.phase !== "lobby") throw new Error("游戏已经开始");
  if (room.players.length < 2) throw new Error("至少需要 2 名玩家或 AI");
  const unready = room.players.filter((player) => !player.isAI && !player.ready);
  if (unready.length > 0) throw new Error("还有玩家没有准备");

  const coords = createIslandCoords(40);
  const terrain = shuffle(TERRAIN_ORDER);
  const mountainIndexes = terrain
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value === "mountain")
    .map(({ index }) => index);
  const volcanoIndexes = new Set(shuffle(mountainIndexes).slice(0, 4));

  const island: GameTile[] = coords.map((coord, index) => ({
    ...coord,
    id: `tile-${index}`,
    terrain: terrain[index],
    active: true,
    sinking: false,
    hiddenEffect: volcanoIndexes.has(index) ? "volcano" : "none"
  }));
  const rescues: GameTile[] = chooseRescueCoords(island).map((coord, index) => ({
    ...coord,
    id: `rescue-${index}`,
    terrain: "beach",
    active: true,
    sinking: false,
    isRescue: true,
    hiddenEffect: "none"
  }));
  room.tiles = [...island, ...rescues];

  const placementTiles = shuffle(island);
  room.explorers = room.players.flatMap((player, playerIndex) =>
    shuffle(TREASURE_VALUES).map((value, explorerIndex) => ({
      id: `${player.id}-explorer-${explorerIndex}`,
      ownerId: player.id,
      tileId: placementTiles[(playerIndex * 10 + explorerIndex) % placementTiles.length].id,
      rescued: false,
      lost: false,
      value
    }))
  );

  room.phase = "playing";
  room.currentPlayerId = room.players[0].id;
  room.turnPhase = "action";
  room.creatureRoll = null;
  room.actionsLeft = 3;
  room.round = 1;
  room.log.push("岛屿开始震动，远征正式开始");
  bump(room);
}

export function moveExplorer(room: GameRoom, playerId: string, explorerId: string, targetTileId: string) {
  if (room.phase !== "playing") throw new Error("当前不在游戏中");
  if (room.currentPlayerId !== playerId) throw new Error("还没轮到你");
  if (room.turnPhase !== "action") throw new Error("当前不是行动阶段");
  if (room.actionsLeft <= 0) throw new Error("本回合行动点已经用完");

  const explorer = room.explorers.find((candidate) => candidate.id === explorerId);
  if (!explorer || explorer.ownerId !== playerId || explorer.lost || explorer.rescued || !explorer.tileId) {
    throw new Error("无法移动这个探险者");
  }
  const source = room.tiles.find((tile) => tile.id === explorer.tileId);
  const target = room.tiles.find((tile) => tile.id === targetTileId);
  if (!source || !target || !target.active || !areAdjacent(source, target)) {
    throw new Error("只能移动到相邻的有效格子");
  }

  const player = room.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error("玩家不存在");
  room.actionsLeft -= 1;
  if (target.isRescue) {
    explorer.tileId = null;
    explorer.rescued = true;
    player.score += explorer.value;
    player.rescued += 1;
    room.log.push(`${player.name} 救出一名探险者，获得 ${explorer.value} 分`);
  } else {
    explorer.tileId = target.id;
    room.log.push(`${player.name} 移动了一名探险者`);
  }
  bump(room);
  checkFinished(room);
}

export function endTurn(room: GameRoom) {
  if (room.phase !== "playing" || !room.currentPlayerId) return;
  if (room.turnPhase !== "action") throw new Error("当前不是行动阶段");
  room.turnPhase = "rising";
  room.actionsLeft = 0;
  room.log.push("行动结束，请选择最低地势的岛屿格");
  bump(room);
}

function advanceTurn(room: GameRoom) {
  const currentIndex = room.players.findIndex((player) => player.id === room.currentPlayerId);
  const nextIndex = (currentIndex + 1) % room.players.length;
  if (nextIndex === 0) room.round += 1;
  room.currentPlayerId = room.players[nextIndex].id;
  room.turnPhase = "action";
  room.creatureRoll = null;
  room.actionsLeft = 3;
  room.log.push(`轮到 ${room.players[nextIndex].name}`);
  bump(room);
}

export function sinkChosenTile(room: GameRoom, playerId: string, tileId: string) {
  if (room.phase !== "playing" || room.currentPlayerId !== playerId) throw new Error("还没轮到你");
  if (room.turnPhase !== "rising") throw new Error("当前不是水位上涨阶段");
  const activeIsland = room.tiles.filter((tile) => tile.active && !tile.isRescue);
  if (activeIsland.length === 0) throw new Error("已经没有可翻开的岛屿格");
  const terrainRank: Record<Terrain, number> = { beach: 0, forest: 1, mountain: 2 };
  const lowest = Math.min(...activeIsland.map((tile) => terrainRank[tile.terrain]));
  const tile = activeIsland.find((candidate) => candidate.id === tileId);
  if (!tile || terrainRank[tile.terrain] !== lowest) throw new Error("必须选择当前最低地势的岛屿格");
  tile.active = false;

  const stranded = room.explorers.filter((explorer) => explorer.tileId === tile.id && !explorer.rescued);
  for (const explorer of stranded) {
    explorer.tileId = null;
    explorer.lost = true;
    const owner = room.players.find((player) => player.id === explorer.ownerId);
    if (owner) owner.lost += 1;
  }

  room.log.push(
    `${tile.terrain === "beach" ? "海滩" : tile.terrain === "forest" ? "森林" : "山地"}沉入海中${
      stranded.length ? `，${stranded.length} 名探险者失踪` : ""
    }`
  );
  if (tile.hiddenEffect === "volcano") {
    room.volcanoes += 1;
    room.log.push(`火山爆发（${room.volcanoes}/${room.maxVolcanoes}）`);
  }
  bump(room);
  if (checkFinished(room)) return;
  room.turnPhase = "creature";
  room.log.push("水位上涨结算完成，请掷生物骰");
  bump(room);
}

export function rollCreatureDie(room: GameRoom, playerId: string) {
  if (room.phase !== "playing" || room.currentPlayerId !== playerId) throw new Error("还没轮到你");
  if (room.turnPhase !== "creature") throw new Error("当前不是生物阶段");
  const faces: PublicRoomState["creatureRoll"][] = [
    "sea-serpent",
    "sea-serpent",
    "shark",
    "shark",
    "kaiju",
    "kaiju"
  ];
  const result = faces[Math.floor(Math.random() * faces.length)]!;
  room.creatureRoll = result;
  const label = result === "sea-serpent" ? "海蛇" : result === "shark" ? "鲨鱼" : "巨兽";
  room.log.push(`生物骰掷出了${label}`);
  bump(room);
  advanceTurn(room);
  return result;
}

export function runAITurn(room: GameRoom) {
  if (room.phase !== "playing" || !room.currentPlayerId) return;
  const player = room.players.find((candidate) => candidate.id === room.currentPlayerId);
  if (!player?.isAI) return;

  while (room.actionsLeft > 0) {
    const explorers = room.explorers.filter(
      (explorer) => explorer.ownerId === player.id && explorer.tileId && !explorer.lost && !explorer.rescued
    );
    if (explorers.length === 0) break;

    const options = explorers.flatMap((explorer) => {
      const source = room.tiles.find((tile) => tile.id === explorer.tileId);
      if (!source) return [];
      return room.tiles
        .filter((tile) => tile.active && areAdjacent(source, tile))
        .map((target) => {
          const rescueDistance = Math.min(
            ...room.tiles
              .filter((tile) => tile.isRescue)
              .map((rescue) => hexDistance(target, rescue))
          );
          return {
            explorer,
            target,
            score: target.isRescue ? 100 + explorer.value : 20 - rescueDistance + Math.random() * 2
          };
        });
    });

    const choice = options.sort((a, b) => b.score - a.score)[0];
    if (!choice) break;
    moveExplorer(room, player.id, choice.explorer.id, choice.target.id);
    if (room.phase !== "playing") return;
  }
  endTurn(room);
  const activeIsland = room.tiles.filter((tile) => tile.active && !tile.isRescue);
  const terrainRank: Record<Terrain, number> = { beach: 0, forest: 1, mountain: 2 };
  const lowest = Math.min(...activeIsland.map((tile) => terrainRank[tile.terrain]));
  const sinkTarget = activeIsland.filter((tile) => terrainRank[tile.terrain] === lowest)[0];
  if (sinkTarget) sinkChosenTile(room, player.id, sinkTarget.id);
  if (room.phase === "playing") rollCreatureDie(room, player.id);
}

function checkFinished(room: GameRoom) {
  const remaining = room.explorers.some((explorer) => !explorer.rescued && !explorer.lost);
  if (remaining && room.volcanoes < room.maxVolcanoes) return false;
  room.phase = "finished";
  room.currentPlayerId = null;
  const highest = Math.max(...room.players.map((player) => player.score));
  room.winnerIds = room.players.filter((player) => player.score === highest).map((player) => player.id);
  room.log.push(`远征结束，最高分 ${highest}`);
  bump(room);
  return true;
}

export function publicState(room: GameRoom, viewerId?: string): PublicRoomState {
  return {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    revision: room.revision,
    players: room.players,
    spectators: room.spectators,
    tiles: room.tiles.map(({ hiddenEffect: _hiddenEffect, ...tile }) => tile),
    explorers: room.explorers.map((explorer) => ({
      ...explorer,
      value: explorer.rescued ? explorer.value : undefined
    })),
    currentPlayerId: room.currentPlayerId,
    turnPhase: room.turnPhase,
    creatureRoll: room.creatureRoll,
    actionsLeft: room.actionsLeft,
    round: room.round,
    volcanoes: room.volcanoes,
    maxVolcanoes: room.maxVolcanoes,
    log: room.log.slice(-12),
    winnerIds: room.winnerIds
  };
}

export const createAIId = () => `ai-${randomUUID()}`;

export function bump(room: GameRoom) {
  room.revision += 1;
}

export function nextAIName(room: GameRoom) {
  const names = ["罗盘", "灯塔", "浪花", "火山", "信天翁"];
  return names.find((name) => !room.players.some((player) => player.name === `AI·${name}`)) ?? `AI·${room.players.length}`;
}

export const asColor = (value: string) => value as PlayerColor;
