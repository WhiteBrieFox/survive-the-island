import { describe, expect, it, vi } from "vitest";
import { areAdjacent, hexDistance } from "../shared/hex";
import {
  addPlayer, createRoom, endTurn, finishCreatureMovement, moveCreature, moveExplorer, placeExplorer, placeRaft,
  publicState, resolveBoarding, resolveDisplacement, respondRepellent, rollCreatureDie, runAITurn, sinkChosenTile, startGame
} from "./game";

type Room = ReturnType<typeof createRoom>;

function completeSetup(room: Room) {
  while (room.turnPhase === "setup-explorer") {
    const playerId = room.currentPlayerId!;
    const tile = room.tiles.find((candidate) => {
      const count = room.explorers.filter((explorer) => explorer.locationId === candidate.id).length;
      return candidate.active && !candidate.isRescue && count < (room.players.length === 5 && room.setupPlaced >= 40 ? 2 : 1);
    })!;
    placeExplorer(room, playerId, tile.id);
  }
  while (room.turnPhase === "setup-raft") {
    const playerId = room.currentPlayerId!;
    const water = room.waterSpaces.find((space) =>
      !room.rafts.some((raft) => raft.locationId === space.id) &&
      room.tiles.some((tile) => tile.active && !tile.isRescue && areAdjacent(space, tile))
    )!;
    placeRaft(room, playerId, water.id);
  }
}

function startedRoom(withAI = false) {
  const room = createRoom("ABC123", "host", "船长");
  room.players[0].ready = true;
  addPlayer(room, withAI ? "ai-1" : "guest", withAI ? "AI·罗盘" : "水手", withAI);
  if (!withAI) room.players[1].ready = true;
  startGame(room);
  completeSetup(room);
  return room;
}

function settlePendingChoices(room: Room, playerId: string) {
  for (let guard = 0; guard < 30 && room.pendingChoice && room.pendingChoice.type !== "move-creature"; guard += 1) {
    if (room.pendingChoice.type === "repellent") {
      const responder = room.pendingChoice.responderIds?.find((id) => !room.pendingChoice?.declinedIds?.includes(id));
      if (responder) respondRepellent(room, responder, false);
      else break;
    } else if (room.pendingChoice.type === "displace") {
      resolveDisplacement(room, playerId, room.pendingChoice.allowedTargetIds![0]);
    } else if (room.pendingChoice.type === "board-raft") {
      resolveBoarding(room, playerId, room.pendingChoice.candidateExplorerIds!.slice(0, room.pendingChoice.maxSelections));
    }
  }
}

function finishCreaturePhase(room: Room, playerId: string) {
  rollCreatureDie(room, playerId);
  for (let guard = 0; guard < 30 && room.currentPlayerId === playerId && room.turnPhase === "creature-move"; guard += 1) {
    if (room.pendingChoice?.type === "repellent") {
      const responder = room.pendingChoice.responderIds?.find((id) => !room.pendingChoice?.declinedIds?.includes(id));
      if (responder) respondRepellent(room, responder, false);
      continue;
    }
    if (room.pendingChoice?.type === "displace") {
      resolveDisplacement(room, playerId, room.pendingChoice.allowedTargetIds![0]);
      continue;
    }
    const creature = room.creatures.find((item) => item.id === room.pendingChoice?.creatureId) ??
      room.creatures.find((item) => item.type === room.pendingChoice?.creatureType);
    if (!creature) break;
    const source = [...room.tiles, ...room.waterSpaces].find((item) => item.id === creature.locationId)!;
    const target = [...room.waterSpaces, ...room.tiles.filter((tile) => !tile.isRescue)]
      .find((item) => areAdjacent(source, item) && (creature.type === "kaiju" || room.waterSpaces.some((water) => water.id === item.id)));
    if (target) moveCreature(room, playerId, creature.id, target.id);
    if (room.turnPhase === "creature-move" && room.pendingChoice?.type === "move-creature" && room.pendingChoice.canFinish) {
      finishCreatureMovement(room, playerId);
    }
  }
}

describe("complete game core", () => {
  it("creates exact component distributions", () => {
    const room = startedRoom();
    const island = room.tiles.filter((tile) => !tile.isRescue);
    expect(island).toHaveLength(40);
    expect(room.tiles.filter((tile) => tile.isRescue)).toHaveLength(4);
    expect(island.filter((tile) => tile.terrain === "beach")).toHaveLength(16);
    expect(island.filter((tile) => tile.terrain === "forest")).toHaveLength(16);
    expect(island.filter((tile) => tile.terrain === "mountain")).toHaveLength(8);
    expect(island.filter((tile) => tile.effect === "volcano")).toHaveLength(4);
    expect(island.filter((tile) => tile.effect === "whirlpool")).toHaveLength(6);
    expect(room.explorers).toHaveLength(40);
    expect(room.rafts).toHaveLength(8);
    expect(room.creatures.filter((creature) => creature.type === "sea-serpent")).toHaveLength(5);
  });

  it("places rescue islands across open water with a guarding sea serpent", () => {
    const room = startedRoom();
    const island = room.tiles.filter((tile) => !tile.isRescue);
    const rescues = room.tiles.filter((tile) => tile.isRescue);
    for (const rescue of rescues) {
      expect(Math.min(...island.map((tile) => hexDistance(tile, rescue)))).toBeGreaterThan(1);
      expect(room.creatures.some((creature) => {
        const space = room.waterSpaces.find((water) => water.id === creature.locationId);
        return creature.type === "sea-serpent" && space && areAdjacent(space, rescue);
      })).toBe(true);
    }
  });

  it("requires a raft to enter a rescue island", () => {
    const room = startedRoom();
    const rescue = room.tiles.find((tile) => tile.isRescue)!;
    const source = room.waterSpaces.find((space) =>
      areAdjacent(space, rescue) && !room.rafts.some((raft) => raft.locationId === space.id)
    )!;
    const explorer = room.explorers.find((candidate) => candidate.ownerId === "host")!;
    explorer.locationId = explorer.tileId = source.id;
    explorer.raftId = null;
    explorer.swimming = true;

    expect(() => moveExplorer(room, "host", explorer.id, rescue.id)).toThrow(/必须乘木筏/);

    const raft = room.rafts[0];
    raft.locationId = source.id;
    explorer.raftId = raft.id;
    explorer.swimming = false;
    moveExplorer(room, "host", explorer.id, rescue.id);
    expect(explorer.rescued).toBe(true);
  });

  it("shows treasure only during placement and after rescue", () => {
    const room = createRoom("ABC123", "host", "船长");
    room.players[0].ready = true;
    addPlayer(room, "guest", "水手");
    room.players[1].ready = true;
    startGame(room);
    expect(publicState(room, "host").explorers.filter((item) => item.value !== undefined)).toHaveLength(1);
    expect(publicState(room, "guest").explorers.filter((item) => item.ownerId === "host").every((item) => item.value === undefined)).toBe(true);
    completeSetup(room);
    expect(publicState(room, "host").explorers.every((item) => item.value === undefined)).toBe(true);
  });

  it("enforces one swimming move per explorer each turn", () => {
    const room = startedRoom();
    const explorer = room.explorers.find((item) => {
      const source = room.tiles.find((tile) => tile.id === item.locationId);
      return item.ownerId === "host" && source &&
        room.waterSpaces.some((space) => areAdjacent(source, space) && !room.rafts.some((raft) => raft.locationId === space.id));
    })!;
    const source = room.tiles.find((tile) => tile.id === explorer.locationId)!;
    const water = room.waterSpaces.find((space) => areAdjacent(source, space) && !room.rafts.some((raft) => raft.locationId === space.id))!;
    moveExplorer(room, "host", explorer.id, water.id);
    const nextWater = room.waterSpaces.find((space) => areAdjacent(water, space))!;
    expect(() => moveExplorer(room, "host", explorer.id, nextWater.id)).toThrow(/已经游过一次/);
  });

  it("lets an explorer move directly onto an adjacent raft", () => {
    const room = startedRoom();
    const explorer = room.explorers.find((candidate) => {
      if (candidate.ownerId !== "host") return false;
      const source = room.tiles.find((tile) => tile.id === candidate.locationId);
      return Boolean(source && room.rafts.some((raft) => {
        const water = room.waterSpaces.find((space) => space.id === raft.locationId);
        return water && areAdjacent(source, water);
      }));
    })!;
    const source = room.tiles.find((tile) => tile.id === explorer.locationId)!;
    const raft = room.rafts.find((candidate) => {
      const water = room.waterSpaces.find((space) => space.id === candidate.locationId);
      return water && areAdjacent(source, water);
    })!;

    moveExplorer(room, "host", explorer.id, raft.locationId);

    expect(explorer.raftId).toBe(raft.id);
    expect(explorer.locationId).toBe(raft.locationId);
    expect(explorer.swimming).toBe(false);
  });

  it("keeps all three turn stages separate", () => {
    const room = startedRoom();
    endTurn(room);
    expect(room.turnPhase).toBe("rising");
    sinkChosenTile(room, "host", room.tiles.find((tile) => tile.active && !tile.isRescue && tile.terrain === "beach")!.id);
    settlePendingChoices(room, "host");
    expect(room.turnPhase).toBe("creature");
    finishCreaturePhase(room, "host");
    expect(room.currentPlayerId).toBe("guest");
    expect(room.turnPhase).toBe("action");
  });

  it("automatically skips a creature roll when none of that type can move", () => {
    const room = startedRoom();
    endTurn(room);
    const tile = room.tiles.find((candidate) => candidate.active && !candidate.isRescue && candidate.terrain === "beach")!;
    tile.effect = "paddles";
    sinkChosenTile(room, "host", tile.id);
    expect(room.turnPhase).toBe("creature");

    const random = vi.spyOn(Math, "random").mockReturnValue(0.4);
    try {
      expect(rollCreatureDie(room, "host")).toBe("shark");
    } finally {
      random.mockRestore();
    }

    expect(room.currentPlayerId).toBe("guest");
    expect(room.turnPhase).toBe("action");
    expect(room.log.at(-2)).toMatch(/没有可移动的鲨鱼/);
  });

  it("lets AI complete setup and a full turn through normal commands", () => {
    const room = createRoom("ABC123", "host", "船长");
    room.players[0].ready = true;
    addPlayer(room, "ai-1", "AI·罗盘", true);
    startGame(room);
    while (room.turnPhase.startsWith("setup")) {
      if (room.currentPlayerId === "ai-1") runAITurn(room);
      else if (room.turnPhase === "setup-explorer") {
        const tile = room.tiles.find((candidate) => candidate.active && !candidate.isRescue && !room.explorers.some((item) => item.locationId === candidate.id))!;
        placeExplorer(room, "host", tile.id);
      } else {
        const water = room.waterSpaces.find((space) => !room.rafts.some((raft) => raft.locationId === space.id) && room.tiles.some((tile) => tile.active && !tile.isRescue && areAdjacent(space, tile)))!;
        placeRaft(room, "host", water.id);
      }
    }
    endTurn(room);
    sinkChosenTile(room, "host", room.tiles.find((tile) => tile.active && !tile.isRescue && tile.terrain === "beach")!.id);
    settlePendingChoices(room, "host");
    finishCreaturePhase(room, "host");
    for (let guard = 0; guard < 30 && room.currentPlayerId === "host" && room.phase === "playing"; guard += 1) {
      settlePendingChoices(room, "host");
      if (room.turnPhase === "creature") finishCreaturePhase(room, "host");
      else if (room.turnPhase === "creature-move") finishCreaturePhase(room, "host");
    }
    expect(room.currentPlayerId).toBe("ai-1");
    for (let guard = 0; guard < 100 && room.currentPlayerId === "ai-1"; guard += 1) {
      settlePendingChoices(room, "ai-1");
      if (room.currentPlayerId === "ai-1") runAITurn(room);
    }
    expect(room.currentPlayerId).toBe("host");
    expect(room.round).toBe(2);
  });

  it("keeps private setup values and event payloads out of public views", () => {
    const room = createRoom("ABC123", "host", "船长");
    room.players[0].ready = true;
    addPlayer(room, "guest", "水手");
    room.players[1].ready = true;
    startGame(room);
    const hostView = publicState(room, "host");
    const guestView = publicState(room, "guest");
    expect(hostView.explorers.filter((explorer) => explorer.value !== undefined)).toHaveLength(1);
    expect(guestView.explorers.filter((explorer) => explorer.ownerId === "host").every((explorer) => explorer.value === undefined)).toBe(true);
    expect(hostView.events.every((event) => event.payload === undefined)).toBe(true);
    placeExplorer(room, "host", room.tiles.find((tile) => !tile.isRescue)!.id);
    expect(publicState(room, "guest").log.at(-1)).not.toMatch(/\d/);
  });

  it("keeps a drawn ability type private", () => {
    const room = startedRoom();
    endTurn(room);
    const tile = room.tiles.find((candidate) => candidate.active && !candidate.isRescue && candidate.terrain === "beach")!;
    tile.effect = "paddles";
    sinkChosenTile(room, "host", tile.id);
    expect(room.players.find((player) => player.id === "host")!.abilities).toContain("paddles");
    expect(publicState(room, "guest").log.join(" ")).not.toContain("船桨");
    expect(publicState(room, "guest").players.find((player) => player.id === "host")!.abilities).toEqual([]);
  });

  it("assigns both controlled colors to two-player explorer sets", () => {
    const room = startedRoom();
    for (const player of room.players) {
      const colors = new Set(room.explorers.filter((explorer) => explorer.ownerId === player.id).map((explorer) => explorer.color));
      expect(colors).toEqual(new Set(player.colors));
    }
  });

  it("moves sharks one space at a time and allows stopping after the first step", () => {
    const room = startedRoom();
    const from = room.waterSpaces.find((space) =>
      room.waterSpaces.some((target) => areAdjacent(space, target))
    )!;
    const target = room.waterSpaces.find((space) => areAdjacent(from, space))!;
    room.creatures.push({ id: "test-shark", type: "shark", locationId: from.id });
    room.turnPhase = "creature-move";
    room.creatureRoll = "shark";
    room.creatureMovesRemaining = 2;
    room.creatureMoved = false;
    room.resumePhase = "creature";
    room.pendingChoice = { type: "move-creature", creatureType: "shark", stepsRemaining: 2, canFinish: false };
    moveCreature(room, "host", "test-shark", target.id);
    expect(room.pendingChoice).toMatchObject({ type: "move-creature", creatureId: "test-shark", stepsRemaining: 1, canFinish: true });
    finishCreatureMovement(room, "host");
    expect(room.currentPlayerId).toBe("guest");
  });

  it("opens a repellent response before a shark attack", () => {
    const room = startedRoom();
    const target = room.waterSpaces.find((space) =>
      room.waterSpaces.some((source) => areAdjacent(source, space))
    )!;
    const source = room.waterSpaces.find((space) => areAdjacent(space, target))!;
    const victim = room.explorers.find((explorer) => explorer.ownerId === "guest")!;
    victim.locationId = victim.tileId = target.id;
    victim.raftId = null;
    victim.swimming = true;
    room.players.find((player) => player.id === "guest")!.abilities.push("repellent");
    room.creatures.push({ id: "test-shark", type: "shark", locationId: source.id });
    room.turnPhase = "creature-move";
    room.creatureRoll = "shark";
    room.creatureMovesRemaining = 2;
    room.creatureMoved = false;
    room.resumePhase = "creature";
    room.pendingChoice = { type: "move-creature", creatureType: "shark", stepsRemaining: 2, canFinish: false };
    moveCreature(room, "host", "test-shark", target.id);
    expect(room.pendingChoice).toMatchObject({ type: "repellent", responderIds: ["guest"] });
    respondRepellent(room, "guest", true);
    expect(room.creatures.some((creature) => creature.id === "test-shark")).toBe(false);
    expect(victim.lost).toBe(false);
  });

  it("lets the active player choose each kaiju displacement target", () => {
    const room = startedRoom();
    const target = room.waterSpaces.find((space) =>
      room.waterSpaces.filter((candidate) => areAdjacent(candidate, space)).length >= 2
    )!;
    const source = room.waterSpaces.find((space) => areAdjacent(space, target))!;
    const victim = room.explorers.find((explorer) => explorer.ownerId === "guest")!;
    victim.locationId = victim.tileId = target.id;
    victim.raftId = null;
    victim.swimming = true;
    room.creatures.push({ id: "test-kaiju", type: "kaiju", locationId: source.id });
    room.turnPhase = "creature-move";
    room.creatureRoll = "kaiju";
    room.creatureMovesRemaining = 2;
    room.creatureMoved = false;
    room.resumePhase = "creature";
    room.pendingChoice = { type: "move-creature", creatureType: "kaiju", stepsRemaining: 2, canFinish: false };
    moveCreature(room, "host", "test-kaiju", target.id);
    expect(room.pendingChoice).toMatchObject({ type: "displace", entityId: victim.id });
    const destination = room.pendingChoice?.allowedTargetIds?.[0];
    expect(destination).toBeTruthy();
    resolveDisplacement(room, "host", destination!);
    expect(victim.locationId).toBe(destination);
  });

  for (const playerCount of [2, 3, 4, 5]) {
    it(`lets ${playerCount} AI players finish a complete game`, () => {
      const room = createRoom(`AI${playerCount}000`, "ai-0", "AI·船长");
      room.players[0].isAI = true;
      room.players[0].aiDifficulty = "strategic";
      for (let index = 1; index < playerCount; index += 1) {
        addPlayer(room, `ai-${index}`, `AI·${index}`, true, index % 2 ? "casual" : "strategic");
      }
      startGame(room);
      for (let guard = 0; guard < 12000 && room.phase !== "finished"; guard += 1) {
        if (room.pendingChoice?.type === "repellent") {
          const responder = room.pendingChoice.responderIds?.find((id) => !room.pendingChoice?.declinedIds?.includes(id));
          if (responder) {
            const player = room.players.find((candidate) => candidate.id === responder)!;
            respondRepellent(room, responder, player.aiDifficulty === "strategic");
            continue;
          }
        }
        runAITurn(room);
      }
      expect(room.phase).toBe("finished");
      expect(room.winnerIds.length).toBeGreaterThan(0);
    });
  }
});
