import { existsSync } from "node:fs";
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
  moveExplorer,
  nextAIName,
  publicState,
  rollCreatureDie,
  runAITurn,
  sinkChosenTile,
  startGame,
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
const rooms = new Map<string, GameRoom>();
const socketRooms = new Map<string, string>();

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

function sessionFor(room: GameRoom, socketId: string): SessionView {
  const role = room.players.some((player) => player.id === socketId) ? "player" : "spectator";
  return { clientId: socketId, role, room: publicState(room, socketId) };
}

function broadcast(room: GameRoom) {
  for (const player of room.players) {
    if (!player.isAI) io.to(player.id).emit("state", publicState(room, player.id));
  }
  for (const spectator of room.spectators) {
    io.to(spectator.id).emit("state", publicState(room, spectator.id));
  }
  scheduleAI(room);
}

function scheduleAI(room: GameRoom) {
  if (room.aiTimer || room.phase !== "playing") return;
  const current = room.players.find((player) => player.id === room.currentPlayerId);
  if (!current?.isAI) return;
  room.aiTimer = setTimeout(() => {
    room.aiTimer = undefined;
    runAITurn(room);
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
      const room = createRoom(code, socket.id, normalizeName(input.name));
      rooms.set(code, room);
      socketRooms.set(socket.id, code);
      socket.join(code);
      return sessionFor(room, socket.id);
    });
  });

  socket.on("joinRoom", (input, ack) => {
    safeAck(ack, () => {
      const code = input.code.trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) throw new Error("找不到这个房间");
      const name = normalizeName(input.name);
      if (input.asSpectator || room.phase !== "lobby" || room.players.length >= 5) {
        addSpectator(room, socket.id, name);
      } else {
        addPlayer(room, socket.id, name);
      }
      socketRooms.set(socket.id, code);
      socket.join(code);
      broadcast(room);
      return sessionFor(room, socket.id);
    });
  });

  socket.on("setReady", (ready, ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      const player = room?.players.find((candidate) => candidate.id === socket.id);
      if (!room || !player || room.phase !== "lobby") throw new Error("无法切换准备状态");
      player.ready = ready;
      room.log.push(`${player.name}${ready ? " 已准备" : " 取消准备"}`);
      bump(room);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("addAI", (ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room || room.hostId !== socket.id) throw new Error("只有房主可以添加 AI");
      const name = nextAIName(room);
      addPlayer(room, createAIId(), `AI·${name}`, true);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("removeAI", (playerId, ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room || room.hostId !== socket.id || room.phase !== "lobby") throw new Error("无法移除 AI");
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
      if (!room || room.hostId !== socket.id) throw new Error("只有房主可以开始游戏");
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
      moveExplorer(room, socket.id, input.explorerId, input.targetTileId);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("endTurn", (ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room || room.currentPlayerId !== socket.id) throw new Error("还没轮到你");
      endTurn(room);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("sinkTile", (tileId, ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room) throw new Error("你不在房间中");
      sinkChosenTile(room, socket.id, tileId);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("rollCreatureDie", (ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room) throw new Error("你不在房间中");
      const result = rollCreatureDie(room, socket.id);
      broadcast(room);
      return result;
    });
  });

  socket.on("leaveRoom", (ack) => {
    safeAck(ack, () => {
      const room = roomForSocket(socket.id);
      if (!room) return;
      room.spectators = room.spectators.filter((spectator) => spectator.id !== socket.id);
      const player = room.players.find((candidate) => candidate.id === socket.id);
      if (player && room.phase === "lobby") room.players = room.players.filter((candidate) => candidate.id !== socket.id);
      socketRooms.delete(socket.id);
      socket.leave(room.code);
      bump(room);
      broadcast(room);
      return undefined;
    });
  });

  socket.on("disconnect", () => {
    const room = roomForSocket(socket.id);
    if (!room) return;
    const player = room.players.find((candidate) => candidate.id === socket.id);
    const spectator = room.spectators.find((candidate) => candidate.id === socket.id);
    if (player) player.connected = false;
    if (spectator) spectator.connected = false;
    socketRooms.delete(socket.id);
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
