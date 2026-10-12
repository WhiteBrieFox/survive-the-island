import type { GameEventView, PublicRoomState } from "../shared/types";
import type { SoundId } from "./sampleSoundDesign";

export function soundForGameEvent(event: GameEventView, room: PublicRoomState): SoundId | null {
  switch (event.type) {
    case "player-joined":
    case "spectator-joined":
      return "player-joined";
    case "game-started":
      return "game-start";
    case "explorer-placed":
      return "explorer-place";
    case "raft-placed":
      return "raft-place";
    case "turns-started":
    case "turn-started":
      return null;
    case "explorer-moved":
      return "explorer-step";
    case "swimmer-moved":
      return "swimmer-move";
    case "explorer-rescued":
      return "explorer-rescue";
    case "raft-moved":
      return "raft-move";
    case "raft-boarded":
    case "raft-rescue":
      return "raft-board";
    case "action-ended":
      return "rising-prompt";
    case "tile-sunk":
      return "tile-sink";
    case "creature-phase":
      return "creature-prompt";
    case "raft-revealed":
      return "raft-reveal";
    case "ability-drawn":
      return "ability-draw";
    case "ability-used":
      return "ability-use";
    case "creature-die":
      return "creature-die";
    case "creature-spawned":
      return "creature-spawn";
    case "creature-skipped":
      return "creature-skip";
    case "creature-moved":
      if (event.message.includes("鲨鱼")) return "shark-move";
      if (event.message.includes("海蛇")) return "serpent-move";
      if (event.message.includes("巨兽")) return "kaiju-move";
      if (room.creatureRoll === "shark") return "shark-move";
      if (room.creatureRoll === "sea-serpent") return "serpent-move";
      return "kaiju-move";
    case "repellent-window":
      return "repellent-ready";
    case "repellent-used":
      return "repellent-use";
    case "shark-attack":
      return "shark-attack";
    case "sea-serpent-attack":
      return "serpent-attack";
    case "kaiju-attack":
      return "kaiju-attack";
    case "unit-displaced":
      return "unit-displaced";
    case "whirlpool":
      return "whirlpool";
    case "volcano":
      return "volcano";
    case "game-finished":
      return "game-finish";
    default:
      return null;
  }
}
