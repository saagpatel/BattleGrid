use battleground_core::{
    grid::{HexGrid, Terrain},
    hex::Hex,
    map_gen::{generate_map, MapGenConfig},
};

fn terrain_signature(grid: &HexGrid, config: &MapGenConfig) -> Vec<(Hex, Terrain)> {
    let mut signature: Vec<_> = Hex::ORIGIN
        .hexes_in_range(config.radius as u32)
        .into_iter()
        .map(|hex| {
            let terrain = grid
                .get_terrain(&hex)
                .expect("generated map should contain every configured hex");
            (hex, terrain)
        })
        .collect();
    signature.sort_by_key(|(hex, _)| *hex);
    signature
}

#[test]
fn rand_010_map_generation_remains_seed_deterministic() {
    let config = MapGenConfig {
        radius: 4,
        ..MapGenConfig::default()
    };

    let first = terrain_signature(&generate_map(42, &config), &config);
    let second = terrain_signature(&generate_map(42, &config), &config);
    let different_seed = terrain_signature(&generate_map(43, &config), &config);

    assert_eq!(first, second);
    assert_ne!(first, different_seed);
    assert!(first.iter().any(|(_, terrain)| matches!(
        terrain,
        Terrain::Forest | Terrain::Mountain | Terrain::Water
    )));
}
