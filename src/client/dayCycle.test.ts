import { describe, expect, it } from "vitest";
import type { PublicRoomState, Terrain } from "../shared/types";
import { dayStageFor } from "./dayCycle";

function roomWith(...terrains: Terrain[]) {
  return {
    phase: "playing",
    tiles: terrains.map((terrain, index) => ({
      id: `tile-${index}`,
      q: index,
      r: 0,
      terrain,
      active: true,
      sinking: false
    }))
  } as PublicRoomState;
}

describe("dayStageFor", () => {
  it("uses morning while any beach remains", () => {
    expect(dayStageFor(roomWith("mountain", "forest", "beach")).id).toBe("morning");
  });

  it("switches to noon after the final beach sinks", () => {
    expect(dayStageFor(roomWith("mountain", "forest")).id).toBe("noon");
  });

  it("switches to dusk after the final forest sinks", () => {
    expect(dayStageFor(roomWith("mountain")).id).toBe("dusk");
  });

  it("ignores sunk terrain and the rescue destination", () => {
    const room = roomWith("mountain");
    room.tiles.push(
      {
        id: "sunk-beach",
        q: 2,
        r: 0,
        terrain: "beach",
        active: false,
        sinking: false
      },
      {
        id: "rescue-forest",
        q: 3,
        r: 0,
        terrain: "forest",
        active: true,
        sinking: false,
        isRescue: true
      }
    );

    expect(dayStageFor(room).id).toBe("dusk");
  });
});
