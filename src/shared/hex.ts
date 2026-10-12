import type { HexCoord } from "./types";

export const hexKey = ({ q, r }: HexCoord) => `${q},${r}`;

export const hexDistance = (a: HexCoord, b: HexCoord) =>
  (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

export const areAdjacent = (a: HexCoord, b: HexCoord) => hexDistance(a, b) === 1;

export const hexToWorld = ({ q, r }: HexCoord, size = 1.12) => ({
  x: size * Math.sqrt(3) * (q + r / 2),
  z: size * 1.5 * r
});

export function createIslandCoords(
  count = 40,
  { excludeCenter = false }: { excludeCenter?: boolean } = {}
): HexCoord[] {
  const candidates: HexCoord[] = [];
  for (let q = -5; q <= 5; q += 1) {
    for (let r = -5; r <= 5; r += 1) {
      if (excludeCenter && q === 0 && r === 0) continue;
      if (hexDistance({ q: 0, r: 0 }, { q, r }) <= 5) candidates.push({ q, r });
    }
  }

  const sorted = candidates.sort((a, b) => {
    const distance = hexDistance({ q: 0, r: 0 }, a) - hexDistance({ q: 0, r: 0 }, b);
    if (distance !== 0) return distance;
    return Math.atan2(a.r, a.q) - Math.atan2(b.r, b.q);
  });

  if (excludeCenter && count === 40) {
    const symmetricEdge = new Set(["0,-4", "4,-4", "0,4", "-4,4"]);
    return sorted.filter((coord) =>
      hexDistance({ q: 0, r: 0 }, coord) <= 3 ||
      symmetricEdge.has(hexKey(coord))
    );
  }

  return sorted.slice(0, count);
}
