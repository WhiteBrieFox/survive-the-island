import { createRoot } from "react-dom/client";
import type {
  GameEventView, PlayerColor, PlayerView, PublicRoomState
} from "../shared/types";
import { ResultPanel } from "./components/ResultPanel";
import "./styles.css";

const player = (
  id: string,
  name: string,
  color: PlayerColor,
  score: number,
  rescued: number,
  lost: number,
  isAI = false
): PlayerView => ({
  id,
  name,
  color,
  isAI,
  aiDifficulty: "strategic",
  connected: true,
  ready: true,
  score,
  rescued,
  lost,
  colors: [color],
  abilities: [],
  explorersToPlace: 0,
  raftsToPlace: 0
});

const players = [
  player("p1", "林舟", "coral", 22, 7, 2),
  player("p2", "阿澄", "teal", 17, 6, 3),
  player("p3", "岛屿向导", "gold", 13, 5, 4, true),
  player("p4", "北辰", "violet", 9, 4, 5)
];

const eventTypes = [
  "explorer-moved", "raft-moved", "tile-sunk", "creature-moved",
  "ability-used", "swimmer-moved", "explorer-rescued"
];

const events: GameEventView[] = Array.from({ length: 48 }, (_, index) => {
  const owner = players[index % players.length];
  const type = eventTypes[index % eventTypes.length];
  return {
    id: index + 1,
    at: new Date(Date.UTC(2026, 9, 10, 12, index)).toISOString(),
    type,
    actorId: owner.id,
    message: `${owner.name} 完成了一次远征行动`,
    detail: `${owner.name} 在第 ${Math.floor(index / 4) + 1} 轮完成了 ${type}。`
  };
});

const room: PublicRoomState = {
  code: "ISLAND",
  phase: "finished",
  hostId: "p1",
  revision: 138,
  players,
  spectators: [{ id: "s1", name: "观战者", connected: true }],
  tiles: [],
  waterSpaces: [],
  explorers: players.flatMap((owner) =>
    Array.from({ length: 10 }, (_, index) => ({
      id: `${owner.id}-e${index}`,
      ownerId: owner.id,
      color: owner.color,
      tileId: null,
      rescued: index < owner.rescued,
      lost: index >= owner.rescued && index < owner.rescued + owner.lost,
      locationId: null,
      raftId: null,
      swimming: false,
      swamThisTurn: false,
      value: index < owner.rescued ? Math.min(5, 1 + index % 5) : undefined
    }))
  ),
  rafts: [],
  creatures: [],
  currentPlayerId: null,
  turnPhase: "creature",
  creatureRoll: null,
  actionsLeft: 0,
  round: 12,
  volcanoes: 3,
  maxVolcanoes: 3,
  pendingChoice: null,
  log: events.slice(-16).map((event) => event.message),
  events,
  winnerIds: ["p1"]
};

function Preview() {
  return (
    <main className="app-shell result-preview-shell">
      <div className="result-preview-board" />
      <ResultPanel
        room={room}
        clientId="p1"
        onOpenLog={() => undefined}
        onReturnToLobby={() => undefined}
      />
    </main>
  );
}

createRoot(document.querySelector("#result-preview-root")!).render(<Preview />);
