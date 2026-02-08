use crate::grid::{HexGrid, Terrain};
use crate::hex::Hex;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use std::collections::{HashSet, VecDeque};

/// Map generation parameters.
pub struct MapGenConfig {
    pub radius: i32,
    pub forest_ratio: f64,
    pub mountain_ratio: f64,
    pub water_ratio: f64,
    pub fortress_count: usize,
    pub spawn_radius: i32,
}

impl Default for MapGenConfig {
    fn default() -> Self {
        Self {
            radius: 7,
            forest_ratio: 0.15,
            mountain_ratio: 0.08,
            water_ratio: 0.05,
            fortress_count: 3,
            spawn_radius: 3,
        }
    }
}

/// Generate a hex grid map with the given seed.
///
/// Guarantees:
/// - Rotationally symmetric (180 degree)
/// - Both spawn zones are passable and connected
/// - Fortresses are placed on the midline
pub fn generate_map(seed: u64, config: &MapGenConfig) -> HexGrid {
    let mut rng = StdRng::seed_from_u64(seed);
    let mut grid = HexGrid::new(config.radius);

    let all_hexes: Vec<Hex> = Hex::ORIGIN.hexes_in_range(config.radius as u32);
    let total = all_hexes.len();

    // Define spawn zones (cleared of obstacles)
    let spawn_a = Hex::new(-config.radius + config.spawn_radius, 0);
    let spawn_b = Hex::new(config.radius - config.spawn_radius, 0);
    let spawn_a_zone: HashSet<Hex> = spawn_a
        .hexes_in_range(config.spawn_radius as u32)
        .into_iter()
        .filter(|h| grid.contains(h))
        .collect();
    let spawn_b_zone: HashSet<Hex> = spawn_b
        .hexes_in_range(config.spawn_radius as u32)
        .into_iter()
        .filter(|h| grid.contains(h))
        .collect();

    // Place terrain on one half, mirror to the other (rotational symmetry)
    let mut placed: HashSet<Hex> = HashSet::new();
    let candidate_hexes: Vec<Hex> = all_hexes
        .iter()
        .filter(|h| {
            !spawn_a_zone.contains(h) && !spawn_b_zone.contains(h) && h.q > 0
                || (h.q == 0 && h.r >= 0)
        })
        .copied()
        .collect();

    let target_mountains = (total as f64 * config.mountain_ratio / 2.0) as usize;
    let target_forests = (total as f64 * config.forest_ratio / 2.0) as usize;
    let target_water = (total as f64 * config.water_ratio / 2.0) as usize;

    // Place mountains
    place_terrain_symmetric(
        &mut grid,
        &candidate_hexes,
        &mut placed,
        &mut rng,
        Terrain::Mountain,
        target_mountains,
    );

    // Place forests
    place_terrain_symmetric(
        &mut grid,
        &candidate_hexes,
        &mut placed,
        &mut rng,
        Terrain::Forest,
        target_forests,
    );

    // Place water
    place_terrain_symmetric(
        &mut grid,
        &candidate_hexes,
        &mut placed,
        &mut rng,
        Terrain::Water,
        target_water,
    );

    // Place fortresses on the midline (q=0)
    let midline_hexes: Vec<Hex> = all_hexes
        .iter()
        .filter(|h| h.q == 0 && !placed.contains(h))
        .copied()
        .collect();

    let fort_count = config.fortress_count.min(midline_hexes.len());
    let step = if fort_count > 1 && midline_hexes.len() > 1 {
        midline_hexes.len() / fort_count
    } else {
        1
    };

    for i in 0..fort_count {
        let idx = i * step;
        if idx < midline_hexes.len() {
            grid.set_terrain(midline_hexes[idx], Terrain::Fortress);
        }
    }

    // Validate connectivity: BFS from spawn_a center should reach spawn_b center
    if !is_connected(&grid, spawn_a, spawn_b) {
        // Fallback: clear a path through the middle
        clear_path(&mut grid, spawn_a, spawn_b);
    }

    grid
}

fn place_terrain_symmetric(
    grid: &mut HexGrid,
    candidates: &[Hex],
    placed: &mut HashSet<Hex>,
    rng: &mut StdRng,
    terrain: Terrain,
    count: usize,
) {
    let mut remaining = count;
    let available: Vec<Hex> = candidates
        .iter()
        .filter(|h| !placed.contains(h))
        .copied()
        .collect();

    for _ in 0..remaining.min(available.len()) {
        if available.is_empty() {
            break;
        }
        let idx = rng.gen_range(0..available.len());
        let hex = available[idx];
        let mirror = Hex::new(-hex.q, -hex.r);

        if !placed.contains(&hex) && grid.contains(&hex) {
            grid.set_terrain(hex, terrain);
            placed.insert(hex);
            remaining = remaining.saturating_sub(1);
        }
        if !placed.contains(&mirror) && grid.contains(&mirror) {
            grid.set_terrain(mirror, terrain);
            placed.insert(mirror);
        }
    }
}

/// BFS connectivity check between two hexes (passable terrain only).
fn is_connected(grid: &HexGrid, from: Hex, to: Hex) -> bool {
    let mut visited = HashSet::new();
    let mut queue = VecDeque::new();
    queue.push_back(from);
    visited.insert(from);

    while let Some(current) = queue.pop_front() {
        if current == to {
            return true;
        }
        for neighbor in current.neighbors() {
            if !visited.contains(&neighbor) && grid.is_passable(&neighbor) {
                visited.insert(neighbor);
                queue.push_back(neighbor);
            }
        }
    }
    false
}

/// Clear a path between two hexes by setting terrain to Plains.
fn clear_path(grid: &mut HexGrid, from: Hex, to: Hex) {
    let line = from.line_to(&to);
    for hex in line {
        if grid.contains(&hex) {
            grid.set_terrain(hex, Terrain::Plains);
        }
    }
}

/// Get spawn zone hexes for a player.
pub fn spawn_zone(center: Hex, radius: i32, grid: &HexGrid) -> Vec<Hex> {
    center
        .hexes_in_range(radius as u32)
        .into_iter()
        .filter(|h| grid.is_passable(h))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_map_basic() {
        let config = MapGenConfig::default();
        let grid = generate_map(42, &config);
        assert_eq!(grid.radius(), config.radius);
        assert!(grid.hex_count() > 0);
    }

    #[test]
    fn map_has_fortresses() {
        let config = MapGenConfig::default();
        let grid = generate_map(42, &config);
        let forts = grid.fortress_hexes();
        assert!(!forts.is_empty());
    }

    #[test]
    fn map_is_connected() {
        let config = MapGenConfig::default();
        let grid = generate_map(42, &config);
        let spawn_a = Hex::new(-config.radius + config.spawn_radius, 0);
        let spawn_b = Hex::new(config.radius - config.spawn_radius, 0);
        assert!(
            is_connected(&grid, spawn_a, spawn_b),
            "Spawns must be connected"
        );
    }

    #[test]
    fn different_seeds_different_maps() {
        let config = MapGenConfig::default();
        let grid1 = generate_map(1, &config);
        let grid2 = generate_map(2, &config);

        // At least some hexes should differ
        let all_hexes = Hex::ORIGIN.hexes_in_range(config.radius as u32);
        let differs = all_hexes
            .iter()
            .any(|h| grid1.get_terrain(h) != grid2.get_terrain(h));
        assert!(differs, "Different seeds should produce different maps");
    }

    #[test]
    fn same_seed_same_map() {
        let config = MapGenConfig::default();
        let grid1 = generate_map(42, &config);
        let grid2 = generate_map(42, &config);

        let all_hexes = Hex::ORIGIN.hexes_in_range(config.radius as u32);
        for hex in all_hexes {
            assert_eq!(
                grid1.get_terrain(&hex),
                grid2.get_terrain(&hex),
                "Same seed must produce identical map at {hex}"
            );
        }
    }

    #[test]
    fn spawn_zones_passable() {
        let config = MapGenConfig::default();
        let grid = generate_map(42, &config);
        let spawn_a = Hex::new(-config.radius + config.spawn_radius, 0);
        let zone = spawn_zone(spawn_a, config.spawn_radius, &grid);
        assert!(!zone.is_empty(), "Spawn zone must have passable hexes");
    }
}
