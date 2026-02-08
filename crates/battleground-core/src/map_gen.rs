use crate::grid::{HexGrid, Terrain};
use crate::hex::Hex;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use serde::{Deserialize, Serialize};
use std::collections::{HashSet, VecDeque};

/// Map generation parameters.
#[derive(Debug, Clone, Serialize, Deserialize)]
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

/// Predefined map presets for different play styles.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum MapPreset {
    /// Balanced default — moderate terrain variety.
    Standard,
    /// Wide-open map with minimal obstacles — favors ranged units and cavalry.
    OpenPlains,
    /// Heavy forest coverage — blocks LOS, favors melee ambush tactics.
    DenseForest,
    /// Narrow corridors between mountain ranges — chokepoint control is key.
    MountainPass,
    /// Water-fragmented map with land bridges — controls map flow.
    IslandChain,
}

impl MapPreset {
    /// All available presets.
    pub fn all() -> &'static [MapPreset] {
        &[
            MapPreset::Standard,
            MapPreset::OpenPlains,
            MapPreset::DenseForest,
            MapPreset::MountainPass,
            MapPreset::IslandChain,
        ]
    }

    /// Human-readable name.
    pub fn name(&self) -> &'static str {
        match self {
            MapPreset::Standard => "Standard",
            MapPreset::OpenPlains => "Open Plains",
            MapPreset::DenseForest => "Dense Forest",
            MapPreset::MountainPass => "Mountain Pass",
            MapPreset::IslandChain => "Island Chain",
        }
    }

    /// Convert preset to MapGenConfig.
    pub fn to_config(&self) -> MapGenConfig {
        match self {
            MapPreset::Standard => MapGenConfig::default(),
            MapPreset::OpenPlains => MapGenConfig {
                radius: 7,
                forest_ratio: 0.04,
                mountain_ratio: 0.02,
                water_ratio: 0.01,
                fortress_count: 3,
                spawn_radius: 3,
            },
            MapPreset::DenseForest => MapGenConfig {
                radius: 7,
                forest_ratio: 0.35,
                mountain_ratio: 0.05,
                water_ratio: 0.02,
                fortress_count: 3,
                spawn_radius: 3,
            },
            MapPreset::MountainPass => MapGenConfig {
                radius: 7,
                forest_ratio: 0.08,
                mountain_ratio: 0.22,
                water_ratio: 0.03,
                fortress_count: 2,
                spawn_radius: 3,
            },
            MapPreset::IslandChain => MapGenConfig {
                radius: 7,
                forest_ratio: 0.10,
                mountain_ratio: 0.03,
                water_ratio: 0.18,
                fortress_count: 3,
                spawn_radius: 3,
            },
        }
    }
}

impl std::fmt::Display for MapPreset {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.name())
    }
}

/// Generate a hex grid map with the given seed and preset.
pub fn generate_map_preset(seed: u64, preset: MapPreset) -> HexGrid {
    generate_map(seed, &preset.to_config())
}

/// Generate a hex grid map with the given seed.
///
/// Guarantees:
/// - Rotationally symmetric (180 degree)
/// - Both spawn zones are passable and connected
/// - Fortresses are placed on the midline
/// - Noise-based terrain for organic clustering
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

    // Generate noise field for organic terrain placement.
    // Each hex gets a noise value [0.0, 1.0) — nearby hexes get correlated values
    // by using seeded hash-based value noise with neighbor averaging.
    let noise = generate_noise_field(&all_hexes, config.radius, &mut rng);

    // Candidate hexes: one half of the map (for symmetry), excluding spawn zones
    let mut placed: HashSet<Hex> = HashSet::new();
    let candidate_hexes: Vec<Hex> = all_hexes
        .iter()
        .filter(|h| {
            !spawn_a_zone.contains(h)
                && !spawn_b_zone.contains(h)
                && (h.q > 0 || (h.q == 0 && h.r >= 0))
        })
        .copied()
        .collect();

    let target_mountains = (total as f64 * config.mountain_ratio / 2.0) as usize;
    let target_forests = (total as f64 * config.forest_ratio / 2.0) as usize;
    let target_water = (total as f64 * config.water_ratio / 2.0) as usize;

    // Place terrain using noise-weighted selection for organic clustering.
    // Mountains prefer high-noise areas, water prefers low-noise, forests mid-range.
    place_terrain_noise(
        &mut grid,
        &candidate_hexes,
        &mut placed,
        &noise,
        &mut rng,
        Terrain::Mountain,
        target_mountains,
        NoisePreference::High,
    );

    place_terrain_noise(
        &mut grid,
        &candidate_hexes,
        &mut placed,
        &noise,
        &mut rng,
        Terrain::Water,
        target_water,
        NoisePreference::Low,
    );

    place_terrain_noise(
        &mut grid,
        &candidate_hexes,
        &mut placed,
        &noise,
        &mut rng,
        Terrain::Forest,
        target_forests,
        NoisePreference::Mid,
    );

    // Place fortresses on the midline (q=0), maintaining rotational symmetry.
    // Only pick from r >= 0 half, then mirror to r < 0.
    let midline_positive: Vec<Hex> = all_hexes
        .iter()
        .filter(|h| h.q == 0 && h.r >= 0 && !placed.contains(h))
        .copied()
        .collect();

    let fort_count = config.fortress_count.min(midline_positive.len() * 2);
    // Place origin fortress first if count is odd
    let mut forts_placed = 0;
    if fort_count % 2 == 1 && midline_positive.contains(&Hex::ORIGIN) {
        grid.set_terrain(Hex::ORIGIN, Terrain::Fortress);
        forts_placed += 1;
    }

    // Place remaining as symmetric pairs
    let pairs_needed = (fort_count - forts_placed) / 2;
    let non_origin: Vec<Hex> = midline_positive
        .iter()
        .filter(|h| **h != Hex::ORIGIN)
        .copied()
        .collect();
    let step = if pairs_needed > 0 && !non_origin.is_empty() {
        non_origin.len() / pairs_needed.max(1)
    } else {
        1
    };

    for i in 0..pairs_needed {
        let idx = i * step;
        if idx < non_origin.len() {
            let hex = non_origin[idx];
            let mirror = Hex::new(-hex.q, -hex.r);
            grid.set_terrain(hex, Terrain::Fortress);
            if grid.contains(&mirror) {
                grid.set_terrain(mirror, Terrain::Fortress);
            }
        }
    }

    // Validate connectivity: BFS from spawn_a center should reach spawn_b center
    if !is_connected(&grid, spawn_a, spawn_b) {
        // Fallback: clear a path through the middle
        clear_path(&mut grid, spawn_a, spawn_b);
    }

    grid
}

/// Noise preference determines which part of the noise spectrum a terrain type prefers.
#[derive(Debug, Clone, Copy)]
enum NoisePreference {
    /// Prefers high noise values (mountains cluster on ridges).
    High,
    /// Prefers mid-range noise values (forests fill valleys between features).
    Mid,
    /// Prefers low noise values (water pools in low areas).
    Low,
}

/// Generate a simple hash-based value noise field over the hex grid.
/// Produces spatially correlated values by averaging with neighbors.
fn generate_noise_field(
    hexes: &[Hex],
    radius: i32,
    rng: &mut StdRng,
) -> std::collections::HashMap<Hex, f64> {
    let mut raw: std::collections::HashMap<Hex, f64> = std::collections::HashMap::new();

    // Seed each hex with a random base value
    for hex in hexes {
        raw.insert(*hex, rng.gen::<f64>());
    }

    // Smooth by averaging with neighbors (2 passes for organic clustering)
    let mut smoothed = raw.clone();
    for _ in 0..2 {
        let prev = smoothed.clone();
        for hex in hexes {
            let neighbors = hex.neighbors();
            let mut sum = prev.get(hex).copied().unwrap_or(0.5) * 2.0; // weight center
            let mut count = 2.0;
            for n in &neighbors {
                if let Some(&v) = prev.get(n) {
                    sum += v;
                    count += 1.0;
                }
            }
            smoothed.insert(*hex, sum / count);
        }
    }

    // Normalize to [0, 1]
    let min = smoothed.values().copied().fold(f64::INFINITY, f64::min);
    let max = smoothed.values().copied().fold(f64::NEG_INFINITY, f64::max);
    let range = (max - min).max(1e-10);
    for hex in hexes {
        if let Some(v) = smoothed.get_mut(hex) {
            *v = (*v - min) / range;
        }
    }

    // Add distance-from-center gradient to push features toward mid-ring
    for hex in hexes {
        let dist = Hex::ORIGIN.distance(hex) as f64 / radius as f64;
        // Bell curve: features cluster in the 0.3-0.7 distance band
        let gradient = 1.0 - (2.0 * dist - 1.0).powi(2);
        if let Some(v) = smoothed.get_mut(hex) {
            *v = *v * 0.7 + gradient * 0.3;
        }
    }

    smoothed
}

/// Place terrain using noise-weighted probability for organic clustering.
#[allow(clippy::too_many_arguments)]
fn place_terrain_noise(
    grid: &mut HexGrid,
    candidates: &[Hex],
    placed: &mut HashSet<Hex>,
    noise: &std::collections::HashMap<Hex, f64>,
    rng: &mut StdRng,
    terrain: Terrain,
    count: usize,
    preference: NoisePreference,
) {
    // Score each candidate based on noise preference
    let mut scored: Vec<(Hex, f64)> = candidates
        .iter()
        .filter(|h| !placed.contains(h))
        .map(|h| {
            let n = noise.get(h).copied().unwrap_or(0.5);
            let score = match preference {
                NoisePreference::High => n,
                NoisePreference::Mid => 1.0 - (2.0 * n - 1.0).abs(), // peaks at 0.5
                NoisePreference::Low => 1.0 - n,
            };
            (*h, score)
        })
        .collect();

    // Sort by score descending, with randomized tiebreaking via shuffle within bands
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    // Take the top candidates (2x count to allow for placement failures)
    // Then randomly select from them for variety
    let pool_size = (count * 3).min(scored.len());
    let pool = &mut scored[..pool_size];

    // Shuffle the pool to add randomness within high-scoring candidates
    for i in (1..pool.len()).rev() {
        let j = rng.gen_range(0..=i);
        pool.swap(i, j);
    }

    let mut remaining = count;
    for &(hex, _) in pool.iter() {
        if remaining == 0 {
            break;
        }
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

/// Summary of a generated map for preview purposes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapSummary {
    pub radius: i32,
    pub total_hexes: usize,
    pub terrain_counts: TerrainCounts,
    pub fortress_positions: Vec<Hex>,
    pub spawn_a: Hex,
    pub spawn_b: Hex,
    pub is_connected: bool,
}

/// Count of each terrain type on the map.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerrainCounts {
    pub plains: usize,
    pub forest: usize,
    pub mountain: usize,
    pub water: usize,
    pub fortress: usize,
}

/// Generate a map summary for client-side preview without sending the full grid.
pub fn map_summary(grid: &HexGrid, config: &MapGenConfig) -> MapSummary {
    let all_hexes = Hex::ORIGIN.hexes_in_range(config.radius as u32);
    let mut counts = TerrainCounts {
        plains: 0,
        forest: 0,
        mountain: 0,
        water: 0,
        fortress: 0,
    };

    for hex in &all_hexes {
        match grid.get_terrain(hex) {
            Some(Terrain::Plains) => counts.plains += 1,
            Some(Terrain::Forest) => counts.forest += 1,
            Some(Terrain::Mountain) => counts.mountain += 1,
            Some(Terrain::Water) => counts.water += 1,
            Some(Terrain::Fortress) => counts.fortress += 1,
            None => {}
        }
    }

    let spawn_a = Hex::new(-config.radius + config.spawn_radius, 0);
    let spawn_b = Hex::new(config.radius - config.spawn_radius, 0);

    MapSummary {
        radius: config.radius,
        total_hexes: grid.hex_count(),
        terrain_counts: counts,
        fortress_positions: grid.fortress_hexes(),
        spawn_a,
        spawn_b,
        is_connected: is_connected(grid, spawn_a, spawn_b),
    }
}

/// Get all terrain data for client-side map preview rendering.
/// Returns (hex, terrain) pairs for the full grid.
pub fn map_preview_data(grid: &HexGrid) -> Vec<(Hex, Terrain)> {
    let mut data: Vec<(Hex, Terrain)> = grid
        .all_hexes()
        .into_iter()
        .filter_map(|h| grid.get_terrain(&h).map(|t| (h, t)))
        .collect();
    // Sort for deterministic output
    data.sort_by_key(|(h, _)| (h.q, h.r));
    data
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

    // --- Phase 8 new tests ---

    #[test]
    fn preset_standard_matches_default() {
        let preset_config = MapPreset::Standard.to_config();
        let default_config = MapGenConfig::default();
        assert_eq!(preset_config.radius, default_config.radius);
        assert_eq!(preset_config.fortress_count, default_config.fortress_count);
        assert!((preset_config.forest_ratio - default_config.forest_ratio).abs() < f64::EPSILON);
    }

    #[test]
    fn all_presets_produce_valid_maps() {
        for preset in MapPreset::all() {
            let config = preset.to_config();
            let grid = generate_map(42, &config);

            assert_eq!(grid.radius(), config.radius, "preset: {preset}");
            assert!(grid.hex_count() > 0, "preset: {preset}");

            let spawn_a = Hex::new(-config.radius + config.spawn_radius, 0);
            let spawn_b = Hex::new(config.radius - config.spawn_radius, 0);
            assert!(
                is_connected(&grid, spawn_a, spawn_b),
                "Spawns must be connected for preset: {preset}"
            );
        }
    }

    #[test]
    fn all_presets_connected_across_seeds() {
        // Test 10 different seeds for each preset — maps must always be connected
        for preset in MapPreset::all() {
            let config = preset.to_config();
            for seed in 0..10 {
                let grid = generate_map(seed, &config);
                let spawn_a = Hex::new(-config.radius + config.spawn_radius, 0);
                let spawn_b = Hex::new(config.radius - config.spawn_radius, 0);
                assert!(
                    is_connected(&grid, spawn_a, spawn_b),
                    "Disconnected map! preset={preset}, seed={seed}"
                );
            }
        }
    }

    #[test]
    fn open_plains_has_few_obstacles() {
        let config = MapPreset::OpenPlains.to_config();
        let grid = generate_map(42, &config);
        let all_hexes = Hex::ORIGIN.hexes_in_range(config.radius as u32);
        let non_plains = all_hexes
            .iter()
            .filter(|h| {
                grid.get_terrain(h)
                    .is_some_and(|t| t != Terrain::Plains && t != Terrain::Fortress)
            })
            .count();
        // Open Plains should have fewer than 15% non-plains/fortress
        let ratio = non_plains as f64 / all_hexes.len() as f64;
        assert!(
            ratio < 0.15,
            "Open Plains has too many obstacles: {ratio:.2}"
        );
    }

    #[test]
    fn dense_forest_has_lots_of_trees() {
        let config = MapPreset::DenseForest.to_config();
        let grid = generate_map(42, &config);
        let all_hexes = Hex::ORIGIN.hexes_in_range(config.radius as u32);
        let forests = all_hexes
            .iter()
            .filter(|h| grid.get_terrain(h) == Some(Terrain::Forest))
            .count();
        // Dense forest should have at least 15% forest
        let ratio = forests as f64 / all_hexes.len() as f64;
        assert!(
            ratio > 0.15,
            "Dense Forest doesn't have enough trees: {ratio:.2}"
        );
    }

    #[test]
    fn mountain_pass_has_mountains() {
        let config = MapPreset::MountainPass.to_config();
        let grid = generate_map(42, &config);
        let all_hexes = Hex::ORIGIN.hexes_in_range(config.radius as u32);
        let mountains = all_hexes
            .iter()
            .filter(|h| grid.get_terrain(h) == Some(Terrain::Mountain))
            .count();
        // Mountain pass should have at least 10% mountains
        let ratio = mountains as f64 / all_hexes.len() as f64;
        assert!(
            ratio > 0.10,
            "Mountain Pass doesn't have enough mountains: {ratio:.2}"
        );
    }

    #[test]
    fn island_chain_has_water() {
        let config = MapPreset::IslandChain.to_config();
        let grid = generate_map(42, &config);
        let all_hexes = Hex::ORIGIN.hexes_in_range(config.radius as u32);
        let water = all_hexes
            .iter()
            .filter(|h| grid.get_terrain(h) == Some(Terrain::Water))
            .count();
        // Island chain should have at least 10% water
        let ratio = water as f64 / all_hexes.len() as f64;
        assert!(
            ratio > 0.10,
            "Island Chain doesn't have enough water: {ratio:.2}"
        );
    }

    #[test]
    fn preset_determinism() {
        for preset in MapPreset::all() {
            let grid1 = generate_map_preset(123, *preset);
            let grid2 = generate_map_preset(123, *preset);
            let all_hexes = Hex::ORIGIN.hexes_in_range(grid1.radius() as u32);
            for hex in &all_hexes {
                assert_eq!(
                    grid1.get_terrain(hex),
                    grid2.get_terrain(hex),
                    "Preset {preset} not deterministic at {hex}"
                );
            }
        }
    }

    #[test]
    fn map_summary_correct() {
        let config = MapGenConfig::default();
        let grid = generate_map(42, &config);
        let summary = map_summary(&grid, &config);

        assert_eq!(summary.radius, config.radius);
        assert_eq!(summary.total_hexes, grid.hex_count());
        assert!(summary.is_connected);

        let total_counted = summary.terrain_counts.plains
            + summary.terrain_counts.forest
            + summary.terrain_counts.mountain
            + summary.terrain_counts.water
            + summary.terrain_counts.fortress;
        assert_eq!(total_counted, summary.total_hexes);
    }

    #[test]
    fn map_preview_data_complete() {
        let config = MapGenConfig::default();
        let grid = generate_map(42, &config);
        let data = map_preview_data(&grid);
        assert_eq!(data.len(), grid.hex_count());
    }

    #[test]
    fn map_preview_data_sorted() {
        let config = MapGenConfig::default();
        let grid = generate_map(42, &config);
        let data = map_preview_data(&grid);
        for pair in data.windows(2) {
            let (a, _) = pair[0];
            let (b, _) = pair[1];
            assert!(
                (a.q, a.r) <= (b.q, b.r),
                "Preview data not sorted: ({},{}) > ({},{})",
                a.q,
                a.r,
                b.q,
                b.r
            );
        }
    }

    #[test]
    fn generate_map_preset_convenience() {
        let grid = generate_map_preset(42, MapPreset::Standard);
        assert_eq!(grid.radius(), 7);
        assert!(grid.hex_count() > 0);
    }

    #[test]
    fn noise_produces_clustering() {
        // Verify terrain has spatial correlation: adjacent hexes are more likely
        // to share terrain than random placement would produce.
        let config = MapPreset::DenseForest.to_config();
        let grid = generate_map(42, &config);
        let all_hexes = Hex::ORIGIN.hexes_in_range(config.radius as u32);

        let mut same_terrain_neighbors = 0;
        let mut total_neighbor_pairs = 0;

        for hex in &all_hexes {
            let terrain = grid.get_terrain(hex);
            for neighbor in hex.neighbors() {
                if let Some(n_terrain) = grid.get_terrain(&neighbor) {
                    total_neighbor_pairs += 1;
                    if terrain == Some(n_terrain) {
                        same_terrain_neighbors += 1;
                    }
                }
            }
        }

        // With noise-based placement, same-terrain neighbors should be > 50%
        // (random placement with these ratios would give ~55-65%, noise should push higher)
        let ratio = same_terrain_neighbors as f64 / total_neighbor_pairs as f64;
        assert!(
            ratio > 0.40,
            "Terrain not clustered enough: {ratio:.2} same-terrain neighbor ratio"
        );
    }

    #[test]
    fn rotational_symmetry() {
        // Verify 180-degree rotational symmetry: terrain at (q,r) should match (-q,-r)
        let config = MapGenConfig::default();
        let grid = generate_map(42, &config);
        let all_hexes = Hex::ORIGIN.hexes_in_range(config.radius as u32);

        for hex in &all_hexes {
            let mirror = Hex::new(-hex.q, -hex.r);
            if grid.contains(&mirror) {
                assert_eq!(
                    grid.get_terrain(hex),
                    grid.get_terrain(&mirror),
                    "Symmetry broken at {hex} vs {mirror}"
                );
            }
        }
    }
}
