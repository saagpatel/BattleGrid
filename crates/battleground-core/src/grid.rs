use crate::hex::Hex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Terrain {
    Plains,
    Forest,
    Mountain,
    Water,
    Fortress,
}

impl Terrain {
    /// Whether units can move onto this terrain.
    pub fn is_passable(&self) -> bool {
        matches!(self, Terrain::Plains | Terrain::Forest | Terrain::Fortress)
    }

    /// Movement cost to enter this terrain.
    pub fn movement_cost(&self) -> u32 {
        match self {
            Terrain::Plains => 1,
            Terrain::Forest => 2,
            Terrain::Mountain => u32::MAX, // impassable
            Terrain::Water => u32::MAX,    // impassable
            Terrain::Fortress => 1,
        }
    }

    /// Defense bonus granted by this terrain.
    pub fn defense_bonus(&self) -> i32 {
        match self {
            Terrain::Plains => 0,
            Terrain::Forest => 1,
            Terrain::Mountain => 0, // impassable, no bonus
            Terrain::Water => 0,
            Terrain::Fortress => 2,
        }
    }

    /// Whether this terrain blocks line of sight.
    pub fn blocks_los(&self) -> bool {
        matches!(self, Terrain::Mountain | Terrain::Forest)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HexCell {
    pub terrain: Terrain,
}

impl HexCell {
    pub fn new(terrain: Terrain) -> Self {
        Self { terrain }
    }
}

/// The hex grid. Uses HashMap for O(1) lookups.
/// Not iterated during simulation — iteration happens over BTreeMaps of units/orders.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HexGrid {
    cells: HashMap<Hex, HexCell>,
    radius: i32,
}

impl HexGrid {
    /// Create a new hex grid with the given radius, all Plains.
    pub fn new(radius: i32) -> Self {
        let mut cells = HashMap::new();
        for hex in Hex::ORIGIN.hexes_in_range(radius as u32) {
            cells.insert(hex, HexCell::new(Terrain::Plains));
        }
        Self { cells, radius }
    }

    pub fn radius(&self) -> i32 {
        self.radius
    }

    pub fn contains(&self, hex: &Hex) -> bool {
        self.cells.contains_key(hex)
    }

    pub fn get(&self, hex: &Hex) -> Option<&HexCell> {
        self.cells.get(hex)
    }

    pub fn get_terrain(&self, hex: &Hex) -> Option<Terrain> {
        self.cells.get(hex).map(|c| c.terrain)
    }

    pub fn set_terrain(&mut self, hex: Hex, terrain: Terrain) {
        if let Some(cell) = self.cells.get_mut(&hex) {
            cell.terrain = terrain;
        }
    }

    pub fn is_passable(&self, hex: &Hex) -> bool {
        self.cells.get(hex).is_some_and(|c| c.terrain.is_passable())
    }

    pub fn movement_cost(&self, hex: &Hex) -> Option<u32> {
        self.cells.get(hex).map(|c| c.terrain.movement_cost())
    }

    /// All hexes in the grid.
    pub fn all_hexes(&self) -> Vec<Hex> {
        self.cells.keys().copied().collect()
    }

    /// All passable hexes.
    pub fn passable_hexes(&self) -> Vec<Hex> {
        self.cells
            .iter()
            .filter(|(_, c)| c.terrain.is_passable())
            .map(|(h, _)| *h)
            .collect()
    }

    /// All fortress hexes.
    pub fn fortress_hexes(&self) -> Vec<Hex> {
        self.cells
            .iter()
            .filter(|(_, c)| c.terrain == Terrain::Fortress)
            .map(|(h, _)| *h)
            .collect()
    }

    pub fn hex_count(&self) -> usize {
        self.cells.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_grid_all_plains() {
        let grid = HexGrid::new(3);
        assert_eq!(grid.hex_count(), 37); // 3*3*3 + 3*3 + 1
        for hex in Hex::ORIGIN.hexes_in_range(3) {
            assert_eq!(grid.get_terrain(&hex), Some(Terrain::Plains));
        }
    }

    #[test]
    fn contains_within_radius() {
        let grid = HexGrid::new(2);
        assert!(grid.contains(&Hex::ORIGIN));
        assert!(grid.contains(&Hex::new(2, 0)));
        assert!(!grid.contains(&Hex::new(3, 0)));
    }

    #[test]
    fn set_and_get_terrain() {
        let mut grid = HexGrid::new(2);
        let hex = Hex::new(1, 0);
        grid.set_terrain(hex, Terrain::Forest);
        assert_eq!(grid.get_terrain(&hex), Some(Terrain::Forest));
    }

    #[test]
    fn passability() {
        let mut grid = HexGrid::new(2);
        let mountain = Hex::new(1, 0);
        let water = Hex::new(0, 1);
        grid.set_terrain(mountain, Terrain::Mountain);
        grid.set_terrain(water, Terrain::Water);

        assert!(grid.is_passable(&Hex::ORIGIN)); // plains
        assert!(!grid.is_passable(&mountain));
        assert!(!grid.is_passable(&water));
        assert!(!grid.is_passable(&Hex::new(99, 99))); // out of bounds
    }

    #[test]
    fn terrain_defense_bonus() {
        assert_eq!(Terrain::Plains.defense_bonus(), 0);
        assert_eq!(Terrain::Forest.defense_bonus(), 1);
        assert_eq!(Terrain::Fortress.defense_bonus(), 2);
    }

    #[test]
    fn terrain_movement_cost() {
        assert_eq!(Terrain::Plains.movement_cost(), 1);
        assert_eq!(Terrain::Forest.movement_cost(), 2);
        assert_eq!(Terrain::Mountain.movement_cost(), u32::MAX);
    }

    #[test]
    fn fortress_hexes() {
        let mut grid = HexGrid::new(2);
        grid.set_terrain(Hex::ORIGIN, Terrain::Fortress);
        grid.set_terrain(Hex::new(1, 0), Terrain::Fortress);
        let forts = grid.fortress_hexes();
        assert_eq!(forts.len(), 2);
    }
}
