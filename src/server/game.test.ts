import { describe, expect, it } from "vitest";
import { areAdjacent } from "../shared/hex";
import {
  addPlayer,
  createRoom,
  endTurn,
  moveExplorer,
  publicState,
  rollCreatureDie,
  runAITurn,
  sinkChosenTile,
  startGame
} from "./game";

function startedRoom(withAI = false) {
  const room = createRoom("ABC123", "host", "船长");
  room.players[0].ready = true;
  addPlayer(room, withAI ? "ai-1" : "guest", withAI ? "AI·罗盘" : "水手", withAI);
  if (!withAI) room.players[1].ready = true;
  startGame(room);
  return room;
}

describe("game room", () => {
  it("creates the 2024 terrain distribution and rescue islands", () => {
    const room = startedRoom();
    const island = room.tiles.filter((tile) => !tile.isRescue);
    expect(island).toHaveLength(40);
    expect(room.tiles.filter((tile) => tile.isRescue)).toHaveLength(4);
    expect(island.filter((tile) => tile.terrain === "beach")).toHaveLength(16);
    expect(island.filter((tile) => tile.terrain === "forest")).toHaveLength(16);
    expect(island.filter((tile) => tile.terrain === "mountain")).toHaveLength(8);
    expect(room.explorers).toHaveLength(20);
  });

  it("does not expose hidden treasure values before rescue", () => {
    const room = startedRoom();
    const state = publicState(room, "host");
    expect(state.explorers.every((explorer) => explorer.value === undefined)).toBe(true);
  });

  it("moves only to an adjacent tile and spends one action", () => {
    const room = startedRoom();
    const explorer = room.explorers.find((candidate) => candidate.ownerId === "host" && candidate.tileId)!;
    const source = room.tiles.find((tile) => tile.id === explorer.tileId)!;
    const target = room.tiles.find((tile) => tile.active && tile.id !== source.id && areAdjacent(source, tile))!;
    moveExplorer(room, "host", explorer.id, target.id);
    expect(explorer.tileId === target.id || explorer.rescued).toBe(true);
    expect(room.actionsLeft).toBe(2);
  });

  it("sinks beaches before forests and mountains", () => {
    const room = startedRoom();
    endTurn(room);
    expect(room.turnPhase).toBe("rising");
    const beach = room.tiles.find((tile) => tile.active && !tile.isRescue && tile.terrain === "beach")!;
    sinkChosenTile(room, "host", beach.id);
    const sunk = room.tiles.filter((tile) => !tile.active && !tile.isRescue);
    expect(sunk).toHaveLength(1);
    expect(sunk[0].terrain).toBe("beach");
    expect(room.turnPhase).toBe("creature");
    rollCreatureDie(room, "host");
    expect(room.currentPlayerId).toBe("guest");
    expect(room.turnPhase).toBe("action");
  });

  it("lets a server AI complete a turn through the same rule functions", () => {
    const room = startedRoom(true);
    endTurn(room);
    const beach = room.tiles.find((tile) => tile.active && !tile.isRescue && tile.terrain === "beach")!;
    sinkChosenTile(room, "host", beach.id);
    rollCreatureDie(room, "host");
    expect(room.currentPlayerId).toBe("ai-1");
    runAITurn(room);
    expect(room.currentPlayerId).toBe("host");
    expect(room.round).toBe(2);
  });
});
