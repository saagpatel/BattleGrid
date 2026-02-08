/**
 * Pure TypeScript hex math utilities (flat-top orientation).
 * Matches the Rust core's Hex coordinate system exactly.
 *
 * Flat-top hex layout:
 *   x = size * 3/2 * q
 *   y = size * (sqrt3/2 * q + sqrt3 * r)
 */

export interface HexCoord {
  q: number;
  r: number;
}

export interface PixelCoord {
  x: number;
  y: number;
}

const SQRT_3 = Math.sqrt(3);

/** Convert axial hex coordinate to pixel center (flat-top). */
export function hexToPixel(q: number, r: number, hexSize: number): PixelCoord {
  const x = hexSize * (1.5 * q);
  const y = hexSize * (SQRT_3 / 2 * q + SQRT_3 * r);
  return { x, y };
}

/** Convert pixel coordinate to nearest hex (flat-top, axial rounding). */
export function pixelToHex(x: number, y: number, hexSize: number): HexCoord {
  const q = (2 / 3 * x) / hexSize;
  const r = (-1 / 3 * x + SQRT_3 / 3 * y) / hexSize;
  return axialRound(q, r);
}

/** Round fractional axial coordinates to the nearest hex. */
function axialRound(q: number, r: number): HexCoord {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);

  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);

  if (dq > dr && dq > ds) {
    rq = -rr - rs;
  } else if (dr > ds) {
    rr = -rq - rs;
  }

  return { q: rq, r: rr };
}

/** Manhattan distance between two hex coordinates. */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = Math.abs(a.q - b.q);
  const dr = Math.abs(a.r - b.r);
  const ds = Math.abs((-a.q - a.r) - (-b.q - b.r));
  return Math.max(dq, dr, ds);
}

/**
 * Compute the 6 corner vertices of a flat-top hex at pixel center (cx, cy).
 * Returns vertices as [x, y] pairs, starting from the rightmost point.
 */
export function hexCorners(cx: number, cy: number, size: number): [number, number][] {
  const corners: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i;
    const angleRad = (Math.PI / 180) * angleDeg;
    corners.push([cx + size * Math.cos(angleRad), cy + size * Math.sin(angleRad)]);
  }
  return corners;
}

/** Check if two hex coordinates are equal. */
export function hexEq(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

/** Generate a hex key string for use in Maps/Sets. */
export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}
