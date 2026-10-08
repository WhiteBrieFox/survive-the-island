import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { Server } from "socket.io";
import {
  addPlayer,
  addSpectator,
  bump,
  createAIId,
  createRoom,
  endTurn,
  finishCreatureMovement,
  moveCreature,
  moveExplorer,
  moveRaft,
  nextAIName,
  placeExplorer,
  placeRaft,
  publicState,
  resolveBoarding,
  resolveDisplacement,
  respondRepellent,
  rollCreatureDie,
  runAITurn,
  sinkChosenTile,
  startGame,
  useAbility,
  type GameRoom
} from "./game";
import type {
  Ack,
  ClientToServerEvents,
  ServerToClientEvents,
  SessionView
} from "../shared/types";

const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "0.0.0.0";
const fastify = Fastify({ logger: true });
const io = new Server<ClientToServerEvents, ServerToClientEvents>(fastify.server, {
  cors: { origin: true }
});
const dataDir = join(fileURLToPath(new URL("../..", import.meta.url)), "data");
const snapshotPath = join(dataDir, "rooms.json");
mkdirSync(dataDir, { recursive: true });
const savedRooms: GameRoom[] = existsSync(snapshotPath) ? JSON.parse(readFileSync(snapshotPath, "utf8")) : [];
const normalizeRoom = (room: GameRoom): GameRoom => ({
  ...room,
  password: room.password ?? "",
  players: room.players.map((player) => ({
    ...player,
    connected: false,
    aiDifficulty: player.aiDifficulty ?? "strategic"
  })),
  spectators: (room.spectators ?? []).map((spectator) => ({ ...spectator, connected: false })),
  explorers: (room.explorers ?? []).map((explorer, index) => {
    const owner = room.players.find((player) => player.id === explorer.ownerId);
    const ownerExplorers = room.explorers.filter((item) => item.ownerId === explorer.ownerId);
    const ownerIndex = ownerExplorers.findIndex((item) => item.id === explorer.id);
    return {
      ...explorer,
      color: explorer.color ?? owner?.colors[Math.floor(ownerIndex / 10)] ?? owner?.color ?? "coral"
    };
  }),
  events: room.events ?? (room.log ?? []).map((message, index) => ({
    id: index + 1,
    at: new Date(0).toISOString(),
    type: "legacy",
    message
  })),
  creatureMovesRemaining: room.creatureMovesRemaining ?? 0,
  creatureMoved: room.creatureMoved ?? false,
  turnStartedWithoutExplorers: room.turnStartedWithoutExplorers ?? false,
  pendingAttack: room.pendingAttack ?? null,
  displacementQueue: room.displacementQueue ?? [],
  interactionContinuation: room.interactionContinuation ?? "none",
  reconnectTokens: room.reconnectTokens ?? {},
  spectatorTokens: room.spectatorTokens ?? {}
});
const rooms = new Map<string, GameRoom>(savedRooms.map((room) => {
  const normalized = normalizeRoom(room);
  return [normalized.code, normalized];
}));
const socketRooms = new Map<string, string>();
const socketPlayers = new Map<string, string>();
const playerSockets = new Map<string, string>();
const socketSpectators = new Map<string, string>();
const spectatorSockets = new Map<string, string>();

const normalizeName = (name: string) => name.trim().slice(0, 18) || "匿名探险者";
const makeCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
};

function roomForSocket(socketId: string) {
  const code = socketRooms.get(socketId);
  return code ? rooms.get(code) : undefined;
}

function identityForSocket(socketId: string) {
  return socketPlayers.get(socketId) ?? socketSpectators.get(socketId) ?? socketId;
}

function sessionFor(room: GameRoom, socketId: string): SessionView {
  const playerId = socketPlayers.get(socketId);
  const spectatorId = socketSpectators.get(socketId);
  const role = playerId ? "player" : "spectator";
  return {
    clientId: playerId ?? spectatorId ?? socketId,
    role,
    reconnectToken: playerId ? room.reconnectTokens[playerId] : spectatorId ? room.spectatorTokens[spectatorId] : undefined,
    room: publicState(room, playerId ?? spectatorId ?? socketId)
  };
}

function persistRooms() {
  const serializable = [...rooms.values()].map(({ aiTimer: _timer, ...room }) => room);
  writeFileSync(snapshotPath, JSON.stringify(serializable, null, 2));
}

function broadcast(room: GameRoom) {
  for (const player of room.players) {
    const socketId = playerSockets.get(player.id);
    if (!player.isAI && socketId) io.to(socketId).emit("state", publicState(room, player.id));
  }
  for (const spectator of room.spectators) {
    const socketId = spectatorSockets.get(spectator.id);
    if (socketId) io.to(socketId).emit("state", publicState(room, spectator.id));
  }
  persistRooms();
  scheduleAI(room);
}

function scheduleAI(room: GameRoom) {
  if (room.aiTimer || room.phase !== "playing") return;
  const responseAI = room.pendingChoice?.type === "repellent"
    ? room.players.find((player) =>
      player.isAI &&
      room.pendingChoice?.responderIds?.includes(player.id) &&
      !room.pendingChoice.declinedIds?.includes(player.id)
    )
    : undefined;
  const current = room.players.find((player) => player.id === room.currentPlayerId);
  if (room.pendingChoice?.type === "repellent" && !responseAI) return;
  if (!responseAI && !current?.isAI) return;
  room.aiTimer = setTimeout(() => {
    room.aiTimer = undefined;
    if (responseAI) respondRepellent(room, responseAI.id, responseAI.aiDifficulty === "strategic");
    else runAITurn(room);
    broadcast(room);
  }, 850);
}

function safeAck<T>(ack: (result: Ack<T>) => void, task: () => T) {
  try {
    ack({ ok: true, data: task() });
  } catch (error) {
    ack({ ok: false, error: error instanceof Error ? error.message : "操作失败" });
  }
}

io.on("connection", (socket) => {
  socket.on("createRoom", (input, ack) => {
    safeAck(ack, () => {
      const code = makeCode();
      const playerId = `player-${randomUUID()}`;
      const token = randomUUID();
      const room = createRoom(code, playerId, normalizeName(input.name), input.password?.trim().slice(0, 24) ?? "");
      room.reconnectTokens[playerId] = token;
      rooms.set(code, room);
      socketRooms.set(socket.id, code);
      socketPlayers.set(socket.id, playerId);
      playerSockets.set(playerId, socket.id);
      socket.join(code);
      broadcast(room);
      return sessionFor(room, socket.id);
    });
  });

  socket.on("joinRoom", (input, ack) => {
    safeAck(ack, () => {
      const code = input.code.trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) throw new Error("找不到这个房间");
      if (room.password && room.password !== input.password?.trim()) throw new Error("房间密码不正确");
      const name = normalizeName(input.name);
      if (input.asSpectator || room.phase !== "lobby" || room.players.length >= 5) {
        const spectatorId = `spectator-${randomUUID()}`;
        addSpectator(room, spectatorId, name);
        room.spectatorTokens[spectatorId] = randomUUID();
        socketSpectators.set(socket.id, spectatorId);
        spectatorSockets.set(spectatorId, socket.id);
      } else {
        const playerId = `player-${randomUUID()}`;
        addPlayer(room, playerId, name);
        room.reconnectTokens[playerId] = randomUUID();
        socketPlayers.set(socket.id, playerId);
        playerSockets.set(playerId, socket.id);
      }
      socketRooms.set(socket.id, code);
      socket.join(code);
      broadcast(room);
      return sessionFor(room, socket.id);
    });
  });

  socket.on("resumeSession", (token, ack) => {
    safeAck(ack, () => {
      const room = [...rooms.values()].find((candidate) =>
        Object.values(candidate.reconnectTokens).includes(token) ||
        Object.values(candidate.spectatorTokens).includes(token)
      );
      if (!room) throw new Error("恢复凭证已失效");
      const playerEntry = Object.entries(room.reconnectTokens).find(([, value]) => value === token);
      if (!playerEntry) {
        const spectatorId = Object.entries(room.spectatorTokens).find(([, value]) => value === token)?.[0];
        const spectator = room.spectators.find((candidate) => candidate.id === spectatorId);
        if (!spectatorId || !spectator) throw new Error("找不到原观战席位");
        const previousSocket = spectatorSockets.get(spectatorId);
        if (previousSocket) {
          socketRooms.delete(previousSocket);
          socketSpectators.delete(previousSocket);
        }
        spectator.connected = true;
        socketRooms.set(socket.id, room.code);
        socketSpectators.set(socket.id, spectatorId);
        spectatorSockets.set(spectatorId, socket.id);
        socket.join(room.code);
        broadcast(room);
        return sessionFor(room, socket.id);
      }
      const playerId = playerEntry[0];
      const player = room.players.find((candidate) => candidate.id === playerId);
      if (!player) throw new Error("找不到原座位");
      const previousSocket = playerSockets.get(playerId);
      if (previousSocket) {
        socketRooms.delete(previousSocket);
        socketPlayers.delete(previousSocket);
      }
      player.connected = true;
      socketRooms.set(socket.id, room.code);
      socketPlayers.set(socket.id, playerId);
      playerSockets.set(playerId, socket.id);
      socket.join(room.code);
      broadcast(room);
      return sessionFor(room, socket.id);
    });
  });

  socket.on("setReady", (ready, ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      const playerId = identityForSocket(socket.id);
      const player = room?.players.find((candidate) => candidate.id === playerId);
      if (!room || !player || room.phase !== "lobby") throw new Error("无法切换准备状态");
      player.ready = ready;
      room.log.push(`${player.name}${ready ? " 已准备" : " 取消准备"}`);
      bump(room);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("addAI", (difficulty, ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room || room.hostId !== identityForSocket(socket.id)) throw new Error("只有房主可以添加 AI");
      const name = nextAIName(room);
      addPlayer(room, createAIId(), `AI·${name}`, true, difficulty);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("removeAI", (playerId, ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room || room.hostId !== identityForSocket(socket.id) || room.phase !== "lobby") throw new Error("无法移除 AI");
      const player = room.players.find((candidate) => candidate.id === playerId && candidate.isAI);
      if (!player) throw new Error("AI 不存在");
      room.players = room.players.filter((candidate) => candidate.id !== playerId);
      room.log.push(`${player.name} 离开了远征`);
      bump(room);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("startGame", (ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room || room.hostId !== identityForSocket(socket.id)) throw new Error("只有房主可以开始游戏");
      startGame(room);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("moveExplorer", (input, ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room) throw new Error("你不在房间中");
      if (input.revision !== room.revision) throw new Error("棋局刚刚发生变化，请重试");
      moveExplorer(room, identityForSocket(socket.id), input.explorerId, input.targetId);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("placeExplorer", (tileId, ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room) throw new Error("你不在房间中");
      placeExplorer(room, identityForSocket(socket.id), tileId);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("placeRaft", (waterId, ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room) throw new Error("你不在房间中");
      placeRaft(room, identityForSocket(socket.id), waterId);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("moveRaft", (input, ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room) throw new Error("你不在房间中");
      if (input.revision !== room.revision) throw new Error("棋局刚刚发生变化，请重试");
      moveRaft(room, identityForSocket(socket.id), input.raftId, input.targetId);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("endTurn", (ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room || room.currentPlayerId !== identityForSocket(socket.id)) throw new Error("还没轮到你");
      endTurn(room);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("sinkTile", (tileId, ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room) throw new Error("你不在房间中");
      sinkChosenTile(room, identityForSocket(socket.id), tileId);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("rollCreatureDie", (ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room) throw new Error("你不在房间中");
      const result = rollCreatureDie(room, identityForSocket(socket.id));
      broadcast(room);
      return result;
    });
  });

  socket.on("moveCreature", (input, ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room) throw new Error("你不在房间中");
      if (input.revision !== room.revision) throw new Error("棋局刚刚发生变化，请重试");
      moveCreature(room, identityForSocket(socket.id), input.creatureId, input.targetId);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("finishCreatureMove", (ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room) throw new Error("你不在房间中");
      finishCreatureMovement(room, identityForSocket(socket.id));
      broadcast(room);
      return undefined;
    });
  });

  socket.on("respondRepellent", (use, ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room) throw new Error("你不在房间中");
      respondRepellent(room, identityForSocket(socket.id), use);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("resolveDisplacement", (targetId, ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room) throw new Error("你不在房间中");
      resolveDisplacement(room, identityForSocket(socket.id), targetId);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("resolveBoarding", (explorerIds, ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room) throw new Error("你不在房间中");
      resolveBoarding(room, identityForSocket(socket.id), explorerIds);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("useAbility", (input, ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room) throw new Error("你不在房间中");
      useAbility(room, identityForSocket(socket.id), input.ability, input.actorId, input.targetId, input.secondaryTargetId);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("leaveRoom", (ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room) return;
      room.spectators = room.spectators.filter((spectator) => spectator.id !== socket.id);
      const spectatorId = socketSpectators.get(socket.id);
      if (spectatorId) {
        room.spectators = room.spectators.filter((spectator) => spectator.id !== spectatorId);
        delete room.spectatorTokens[spectatorId];
        spectatorSockets.delete(spectatorId);
      }
      const playerId = socketPlayers.get(socket.id);
      const player = room.players.find((candidate) => candidate.id === playerId);
      if (player && room.phase === "lobby") {
        room.players = room.players.filter((candidate) => candidate.id !== playerId);
        delete room.reconnectTokens[player.id];
      }
      socketRooms.delete(socket.id);
      socketPlayers.delete(socket.id);
      socketSpectators.delete(socket.id);
      if (playerId) playerSockets.delete(playerId);
      socket.leave(room.code);
      bump(room);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("disconnect", () => {
    const room = roomForSocket(socket.id);
    if (!room) return;
    const playerId = socketPlayers.get(socket.id);
    const spectatorId = socketSpectators.get(socket.id);
    const player = room.players.find((candidate) => candidate.id === playerId);
    const spectator = room.spectators.find((candidate) => candidate.id === spectatorId);
    if (player) player.connected = false;
    if (spectator) spectator.connected = false;
    socketRooms.delete(socket.id);
    socketPlayers.delete(socket.id);
    socketSpectators.delete(socket.id);
    if (playerId) playerSockets.delete(playerId);
    if (spectatorId) spectatorSockets.delete(spectatorId);
    bump(room);
    broadcast(room);
  });
});

fastify.get("/health", async () => ({ ok: true, rooms: rooms.size }));

if (process.env.NODE_ENV === "production") {
  const root = join(fileURLToPath(new URL("../..", import.meta.url)), "dist/client");
  if (!existsSync(root)) throw new Error("缺少 dist/client，请先运行 pnpm build");
  await fastify.register(fastifyStatic, { root, wildcard: false });
  fastify.setNotFoundHandler((_request, reply) => reply.sendFile("index.html"));
}

await fastify.listen({ port, host });
fastify.log.info(`沉岛远征已启动：http://${host}:${port}`);
