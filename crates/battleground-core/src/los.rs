use crate::grid::{HexGrid, Terrain};
use crate::hex::Hex;
use std::collections::HashSet;

/// Check line of sight between two hexes.
///
/// LOS rules:
/// - Mountains always block LOS.
/// - Forests block LOS, UNLESS the viewer is in the forest.
/// - When a line passes exactly between two hexes, check BOTH sides.
///   If either blocks, LOS is blocked.
pub fn has_line_of_sight(grid: &HexGrid, from: Hex, to: Hex) -> bool {
    if from == to {
        return true;
    }

    let viewer_in_forest = grid.get_terrain(&from) == Some(Terrain::Forest);

    // Get both possible lines (handles edge-between-hex ambiguity)
    let (line_a, line_b) = from.line_to_both(&to);

    let check_line = |line: &[Hex]| -> bool {
        for &hex in &line[1..line.len() - 1] {
            // Skip endpoints (viewer and target)
            if let Some(terrain) = grid.get_terrain(&hex) {
                match terrain {
                    Terrain::Mountain => return false,
                    Terrain::Forest => {
                        if !viewer_in_forest {
                            return false;
                        }
                    }
                    _ => {}
                }
            }
        }
        true
    };

    // Both lines must be clear for LOS to exist
    // (if the line passes between hexes, either blocked side blocks LOS)
    let a_clear = check_line(&line_a);
    let b_clear = check_line(&line_b);

    // If both lines are the same (no ambiguity), just need one clear
    if line_a == line_b {
        return a_clear;
    }

    // If they differ (edge case), BOTH must be clear
    a_clear && b_clear
}

/// Get all hexes visible from a position.
pub fn visible_hexes(grid: &HexGrid, from: Hex, max_range: u32) -> HashSet<Hex> {
    let mut visible = HashSet::new();
    visible.insert(from);

    for hex in from.hexes_in_range(max_range) {
        if hex == from {
            continue;
        }
        if !grid.contains(&hex) {
            continue;
        }
        if has_line_of_sight(grid, from, hex) {
            visible.insert(hex);
        }
    }

    visible
}

/// Compute visible hexes for a set of unit positions (union of all visibility).
pub fn visible_hexes_for_positions(
    grid: &HexGrid,
    positions: &[Hex],
    sight_range: u32,
) -> HashSet<Hex> {
    let mut all_visible = HashSet::new();
    for &pos in positions {
        all_visible.extend(visible_hexes(grid, pos, sight_range));
    }
    all_visible
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::grid::Terrain;

    #[test]
    fn los_to_self() {
        let grid = HexGrid::new(3);
        assert!(has_line_of_sight(&grid, Hex::ORIGIN, Hex::ORIGIN));
    }

    #[test]
    fn los_clear_plains() {
        let grid = HexGrid::new(5);
        assert!(has_line_of_sight(&grid, Hex::ORIGIN, Hex::new(3, 0)));
    }

    #[test]
    fn los_blocked_by_mountain() {
        let mut grid = HexGrid::new(5);
        grid.set_terrain(Hex::new(1, 0), Terrain::Mountain);
        assert!(!has_line_of_sight(&grid, Hex::ORIGIN, Hex::new(2, 0)));
    }

    #[test]
    fn los_blocked_by_forest() {
        let mut grid = HexGrid::new(5);
        grid.set_terrain(Hex::new(1, 0), Terrain::Forest);
        // Viewer NOT in forest → blocked
        assert!(!has_line_of_sight(&grid, Hex::ORIGIN, Hex::new(2, 0)));
    }

    #[test]
    fn los_from_forest_through_forest() {
        let mut grid = HexGrid::new(5);
        grid.set_terrain(Hex::ORIGIN, Terrain::Forest);
        grid.set_terrain(Hex::new(1, 0), Terrain::Forest);
        // Viewer IN forest → can see through forest
        assert!(has_line_of_sight(&grid, Hex::ORIGIN, Hex::new(2, 0)));
    }

    #[test]
    fn los_adjacent_always_visible() {
        let mut grid = HexGrid::new(3);
        // Mountain at the target itself shouldn't block LOS to it
        // (mountains only block when they're BETWEEN viewer and target)
        grid.set_terrain(Hex::new(1, 0), Terrain::Mountain);
        // Adjacent hex: the mountain IS the target, no hexes between
        assert!(has_line_of_sight(&grid, Hex::ORIGIN, Hex::new(1, 0)));
    }

    #[test]
    fn visible_hexes_basic() {
        let grid = HexGrid::new(3);
        let visible = visible_hexes(&grid, Hex::ORIGIN, 3);
        // On all-plains grid with radius 3, should see all hexes in range
        assert_eq!(visible.len(), 37); // all hexes within radius 3
    }

    #[test]
    fn visible_hexes_with_obstacle() {
        let mut grid = HexGrid::new(5);
        // Place a wall of mountains
        grid.set_terrain(Hex::new(1, -1), Terrain::Mountain);
        grid.set_terrain(Hex::new(1, 0), Terrain::Mountain);
        grid.set_terrain(Hex::new(1, 1), Terrain::Mountain);
        let visible = visible_hexes(&grid, Hex::ORIGIN, 5);
        // Should not see hexes directly behind the mountain wall
        assert!(!visible.contains(&Hex::new(2, 0)));
    }

    #[test]
    fn visible_hexes_for_multiple_positions() {
        let grid = HexGrid::new(3);
        let positions = vec![Hex::new(-2, 0), Hex::new(2, 0)];
        let visible = visible_hexes_for_positions(&grid, &positions, 2);
        // Union of two visibility zones should cover more than either alone
        let single = visible_hexes(&grid, Hex::new(-2, 0), 2);
        assert!(visible.len() >= single.len());
    }
}
