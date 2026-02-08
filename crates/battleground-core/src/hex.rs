use serde::{Deserialize, Serialize};

/// Axial hex coordinate (flat-top orientation).
/// Cube constraint: q + r + s = 0, where s = -q - r.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct Hex {
    pub q: i32,
    pub r: i32,
}

impl Hex {
    pub const ORIGIN: Hex = Hex { q: 0, r: 0 };

    pub const fn new(q: i32, r: i32) -> Self {
        Self { q, r }
    }

    /// Cube s coordinate (derived from axial).
    pub const fn s(&self) -> i32 {
        -self.q - self.r
    }

    /// Manhattan distance in cube coordinates.
    pub fn distance(&self, other: &Hex) -> u32 {
        let dq = (self.q - other.q).unsigned_abs();
        let dr = (self.r - other.r).unsigned_abs();
        let ds = (self.s() - other.s()).unsigned_abs();
        dq.max(dr).max(ds)
    }

    /// The 6 neighbors of this hex (flat-top orientation).
    pub fn neighbors(&self) -> [Hex; 6] {
        DIRECTIONS.map(|d| Hex::new(self.q + d.q, self.r + d.r))
    }

    /// All hexes within `radius` of this hex (inclusive).
    pub fn hexes_in_range(&self, radius: u32) -> Vec<Hex> {
        let r = radius as i32;
        let mut result = Vec::new();
        for dq in -r..=r {
            let r1 = (-r).max(-dq - r);
            let r2 = r.min(-dq + r);
            for dr in r1..=r2 {
                result.push(Hex::new(self.q + dq, self.r + dr));
            }
        }
        result
    }

    /// Ring of hexes exactly `radius` away from this hex.
    pub fn hex_ring(&self, radius: u32) -> Vec<Hex> {
        if radius == 0 {
            return vec![*self];
        }
        let mut results = Vec::with_capacity(6 * radius as usize);
        let mut current = Hex::new(self.q - radius as i32, self.r + radius as i32);
        for dir in &DIRECTIONS {
            for _ in 0..radius {
                results.push(current);
                current = Hex::new(current.q + dir.q, current.r + dir.r);
            }
        }
        results
    }

    /// Convert hex to pixel center (flat-top).
    pub fn to_pixel(&self, hex_size: f64) -> (f64, f64) {
        let x = hex_size * (3.0_f64 / 2.0 * self.q as f64);
        let y = hex_size * (SQRT_3 / 2.0 * self.q as f64 + SQRT_3 * self.r as f64);
        (x, y)
    }

    /// Convert pixel to nearest hex (flat-top, axial rounding).
    pub fn from_pixel(x: f64, y: f64, hex_size: f64) -> Hex {
        let q = (2.0 / 3.0 * x) / hex_size;
        let r = (-1.0 / 3.0 * x + SQRT_3 / 3.0 * y) / hex_size;
        axial_round(q, r)
    }

    /// Hex line draw between two hexes (for LOS).
    pub fn line_to(&self, other: &Hex) -> Vec<Hex> {
        let n = self.distance(other) as i32;
        if n == 0 {
            return vec![*self];
        }
        let mut results = Vec::with_capacity((n + 1) as usize);
        for i in 0..=n {
            let t = i as f64 / n as f64;
            let q = lerp(self.q as f64, other.q as f64, t);
            let r = lerp(self.r as f64, other.r as f64, t);
            results.push(axial_round(q, r));
        }
        results
    }

    /// Hex line with nudge (offset to avoid exact edge cases).
    /// When a line passes exactly between two hexes, this nudges slightly
    /// to pick one side consistently.
    pub fn line_to_nudged(&self, other: &Hex) -> Vec<Hex> {
        let n = self.distance(other) as i32;
        if n == 0 {
            return vec![*self];
        }
        let eps = 1e-6;
        let mut results = Vec::with_capacity((n + 1) as usize);
        for i in 0..=n {
            let t = i as f64 / n as f64;
            let q = lerp(self.q as f64 + eps, other.q as f64 + eps, t);
            let r = lerp(self.r as f64 + eps, other.r as f64 - eps, t);
            results.push(axial_round(q, r));
        }
        results
    }

    /// Returns both possible lines when a line passes between hexes.
    /// Used for LOS: if either path is blocked, LOS is blocked.
    pub fn line_to_both(&self, other: &Hex) -> (Vec<Hex>, Vec<Hex>) {
        let n = self.distance(other) as i32;
        if n == 0 {
            return (vec![*self], vec![*self]);
        }
        let eps = 1e-6;
        let mut line_a = Vec::with_capacity((n + 1) as usize);
        let mut line_b = Vec::with_capacity((n + 1) as usize);
        for i in 0..=n {
            let t = i as f64 / n as f64;
            let q = lerp(self.q as f64, other.q as f64, t);
            let r = lerp(self.r as f64, other.r as f64, t);
            line_a.push(axial_round(q + eps, r + eps));
            line_b.push(axial_round(q - eps, r - eps));
        }
        (line_a, line_b)
    }

    /// Rotate hex 60 degrees clockwise around origin.
    pub fn rotate_cw(&self) -> Hex {
        Hex::new(-self.r, -self.s())
    }

    /// Rotate hex 60 degrees counter-clockwise around origin.
    pub fn rotate_ccw(&self) -> Hex {
        Hex::new(-self.s(), -self.q)
    }

    /// Reflect hex across q axis.
    pub fn reflect_q(&self) -> Hex {
        Hex::new(self.q, self.s())
    }
}

impl std::fmt::Display for Hex {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "({}, {})", self.q, self.r)
    }
}

const SQRT_3: f64 = 1.732_050_808_068_872;

/// Flat-top hex direction vectors.
const DIRECTIONS: [Hex; 6] = [
    Hex { q: 1, r: 0 },
    Hex { q: 1, r: -1 },
    Hex { q: 0, r: -1 },
    Hex { q: -1, r: 0 },
    Hex { q: -1, r: 1 },
    Hex { q: 0, r: 1 },
];

fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

fn axial_round(q: f64, r: f64) -> Hex {
    let s = -q - r;
    let mut rq = q.round();
    let mut rr = r.round();
    let rs = s.round();

    let dq = (rq - q).abs();
    let dr = (rr - r).abs();
    let ds = (rs - s).abs();

    if dq > dr && dq > ds {
        rq = -rr - rs;
    } else if dr > ds {
        rr = -rq - rs;
    }
    // else: rs = -rq - rr (already satisfied)

    Hex::new(rq as i32, rr as i32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cube_constraint() {
        let h = Hex::new(3, -7);
        assert_eq!(h.q + h.r + h.s(), 0);
    }

    #[test]
    fn distance_origin() {
        assert_eq!(Hex::ORIGIN.distance(&Hex::ORIGIN), 0);
    }

    #[test]
    fn distance_neighbors() {
        let center = Hex::ORIGIN;
        for n in center.neighbors() {
            assert_eq!(center.distance(&n), 1);
        }
    }

    #[test]
    fn distance_symmetric() {
        let a = Hex::new(2, -3);
        let b = Hex::new(-1, 4);
        assert_eq!(a.distance(&b), b.distance(&a));
    }

    #[test]
    fn distance_known() {
        assert_eq!(Hex::new(0, 0).distance(&Hex::new(3, -3)), 3);
        assert_eq!(Hex::new(1, 1).distance(&Hex::new(-2, 3)), 3);
    }

    #[test]
    fn neighbors_count() {
        assert_eq!(Hex::ORIGIN.neighbors().len(), 6);
    }

    #[test]
    fn neighbors_unique() {
        let ns = Hex::ORIGIN.neighbors();
        for i in 0..6 {
            for j in (i + 1)..6 {
                assert_ne!(ns[i], ns[j]);
            }
        }
    }

    #[test]
    fn hexes_in_range_count() {
        // Hex count at radius r = 3r^2 + 3r + 1
        assert_eq!(Hex::ORIGIN.hexes_in_range(0).len(), 1);
        assert_eq!(Hex::ORIGIN.hexes_in_range(1).len(), 7);
        assert_eq!(Hex::ORIGIN.hexes_in_range(2).len(), 19);
        assert_eq!(Hex::ORIGIN.hexes_in_range(3).len(), 37);
    }

    #[test]
    fn hex_ring_count() {
        assert_eq!(Hex::ORIGIN.hex_ring(0).len(), 1);
        assert_eq!(Hex::ORIGIN.hex_ring(1).len(), 6);
        assert_eq!(Hex::ORIGIN.hex_ring(2).len(), 12);
        assert_eq!(Hex::ORIGIN.hex_ring(3).len(), 18);
    }

    #[test]
    fn pixel_roundtrip() {
        let hex_size = 32.0;
        for hex in Hex::ORIGIN.hexes_in_range(20) {
            let (px, py) = hex.to_pixel(hex_size);
            let recovered = Hex::from_pixel(px, py, hex_size);
            assert_eq!(hex, recovered, "roundtrip failed for {hex}");
        }
    }

    #[test]
    fn line_to_self() {
        let h = Hex::new(2, 3);
        assert_eq!(h.line_to(&h), vec![h]);
    }

    #[test]
    fn line_to_neighbor() {
        let a = Hex::ORIGIN;
        let b = Hex::new(1, 0);
        let line = a.line_to(&b);
        assert_eq!(line.len(), 2);
        assert_eq!(line[0], a);
        assert_eq!(line[1], b);
    }

    #[test]
    fn line_includes_endpoints() {
        let a = Hex::new(0, 0);
        let b = Hex::new(3, -3);
        let line = a.line_to(&b);
        assert_eq!(line.first(), Some(&a));
        assert_eq!(line.last(), Some(&b));
        assert_eq!(line.len(), 4); // distance 3 → 4 points
    }

    #[test]
    fn rotate_six_times_returns_to_start() {
        let h = Hex::new(2, -1);
        let mut current = h;
        for _ in 0..6 {
            current = current.rotate_cw();
        }
        assert_eq!(current, h);
    }

    #[test]
    fn rotate_ccw_inverse_of_cw() {
        let h = Hex::new(3, -2);
        assert_eq!(h.rotate_cw().rotate_ccw(), h);
        assert_eq!(h.rotate_ccw().rotate_cw(), h);
    }

    #[test]
    fn serde_roundtrip() {
        let h = Hex::new(5, -3);
        let bytes = bincode::serialize(&h).unwrap();
        let decoded: Hex = bincode::deserialize(&bytes).unwrap();
        assert_eq!(h, decoded);
    }
}
