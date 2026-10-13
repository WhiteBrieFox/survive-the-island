import { describe, expect, it } from "vitest";
import type { GameEventView, PublicRoomState } from "../shared/types";
import { soundForGameEvent } from "./gameSound";

function event(type: string, message = ""): GameEventView {
  return { id: 1, at: "2026-10-10T00:00:00.000Z", type, message };
}

const room = { creatureRoll: "shark" } as PublicRoomState;

describe("soundForGameEvent", () => {
  it("maps the main board and reward events", () => {
    expect(soundForGameEvent(event("tile-sunk"), room)).toBe("tile-sink");
    expect(soundForGameEvent(event("raft-revealed"), room)).toBe("raft-reveal");
    expect(soundForGameEvent(event("ability-drawn"), room)).toBe("ability-draw");
    expect(soundForGameEvent(event("whirlpool"), room)).toBe("whirlpool");
    expect(soundForGameEvent(event("game-finished"), room)).toBe("game-finish");
    expect(soundForGameEvent(event("turn-started"), room)).toBeNull();
  });

  it("uses different movement sounds on land and in water", () => {
    expect(soundForGameEvent(event("explorer-moved"), room)).toBe("explorer-step");
    expect(soundForGameEvent(event("swimmer-moved"), room)).toBe("swimmer-move");
    expect(soundForGameEvent(event("raft-moved"), room)).toBe("raft-move");
  });

  it("distinguishes creature movement from the event message", () => {
    expect(soundForGameEvent(event("creature-moved", "鲨鱼移动了"), room)).toBe("shark-move");
    expect(soundForGameEvent(event("creature-moved", "海蛇移动了"), room)).toBe("serpent-move");
    expect(soundForGameEvent(event("creature-moved", "巨兽移动了"), room)).toBe("kaiju-move");
  });

  it("maps chained creature interactions independently", () => {
    expect(soundForGameEvent(event("kaiju-attack"), room)).toBe("kaiju-attack");
    expect(soundForGameEvent(event("unit-displaced"), room)).toBe("unit-displaced");
    expect(soundForGameEvent(event("shark-attack"), room)).toBe("shark-attack");
  });
});
