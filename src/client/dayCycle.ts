import type { PublicRoomState, Terrain } from "../shared/types";

export type DayStageId = "morning" | "noon" | "dusk";

export type DayStage = {
  id: DayStageId;
  label: string;
  time: string;
  terrain: Terrain;
  track: string;
  sky: string;
  fog: string;
  ocean: string;
  oceanDepth: string;
  sun: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  ambient: number;
  hemisphereSky: string;
  hemisphereGround: string;
  hemisphereIntensity: number;
  exposure: number;
  sparkle: string;
};

export const DAY_STAGES: Record<DayStageId, DayStage> = {
  morning: {
    id: "morning",
    label: "清晨",
    time: "07:20",
    terrain: "beach",
    track: "/assets/audio/exploration-1.m4a",
    sky: "#e3a878",
    fog: "#e9c99c",
    ocean: "#3a9da7",
    oceanDepth: "#155c68",
    sun: [-24, 7, 10],
    sunColor: "#ffbd68",
    sunIntensity: 3.15,
    ambient: 0.72,
    hemisphereSky: "#ffd9a1",
    hemisphereGround: "#315d58",
    hemisphereIntensity: 0.72,
    exposure: 0.96,
    sparkle: "#ffe1a5"
  },
  noon: {
    id: "noon",
    label: "正午",
    time: "12:30",
    terrain: "forest",
    track: "/assets/audio/exploration-2.m4a",
    sky: "#2aabd0",
    fog: "#46b5cc",
    ocean: "#0789ad",
    oceanDepth: "#07546b",
    sun: [2, 32, -1],
    sunColor: "#fffdf0",
    sunIntensity: 2.65,
    ambient: 0.82,
    hemisphereSky: "#dff7f5",
    hemisphereGround: "#1b635b",
    hemisphereIntensity: 0.88,
    exposure: 0.82,
    sparkle: "#d8ffff"
  },
  dusk: {
    id: "dusk",
    label: "黄昏",
    time: "18:20",
    terrain: "mountain",
    track: "/assets/audio/crisis-1.m4a",
    sky: "#c86f62",
    fog: "#8e5360",
    ocean: "#176f87",
    oceanDepth: "#083e56",
    sun: [20, 8, -12],
    sunColor: "#ffb36b",
    sunIntensity: 2.65,
    ambient: 0.64,
    hemisphereSky: "#f0a07b",
    hemisphereGround: "#282f46",
    hemisphereIntensity: 0.6,
    exposure: 0.92,
    sparkle: "#ffd0a2"
  }
};

export function dayStageFor(room: PublicRoomState | null): DayStage {
  if (!room || room.phase === "lobby") return DAY_STAGES.morning;
  const activeTerrain = new Set(
    room.tiles
      .filter((tile) => tile.active && !tile.isRescue)
      .map((tile) => tile.terrain)
  );
  if (activeTerrain.has("beach")) return DAY_STAGES.morning;
  if (activeTerrain.has("forest")) return DAY_STAGES.noon;
  return DAY_STAGES.dusk;
}
