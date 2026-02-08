use crate::error::GameError;
use crate::grid::HexGrid;
use crate::hex::Hex;
use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap, HashSet};

/// A* pathfinding on the hex grid.
///
/// # Ruling R3: Movement through friendly units
/// Units CAN move THROUGH friendly-occupied hexes but CANNOT end there.
/// `blocked` = enemy units (fully impassable).
/// `friendly_occupied` = friendly units (transit OK, can't be destination).
pub fn find_path(
    grid: &HexGrid,
    from: Hex,
    to: Hex,
    max_cost: u32,
    blocked: &HashSet<Hex>,
    friendly_occupied: &HashSet<Hex>,
) -> Result<Vec<Hex>, GameError> {
    if from == to {
        return Ok(vec![from]);
    }

    // Destination cannot be blocked or friendly-occupied
    if blocked.contains(&to) || friendly_occupied.contains(&to) {
        return Err(GameError::NoPath { from, to });
    }

    if !grid.is_passable(&to) {
        return Err(GameError::NoPath { from, to });
    }

    let mut open = BinaryHeap::new();
    let mut g_score: HashMap<Hex, u32> = HashMap::new();
    let mut came_from: HashMap<Hex, Hex> = HashMap::new();

    g_score.insert(from, 0);
    open.push(Reverse((from.distance(&to), 0u32, from)));

    while let Some(Reverse((_f, g, current))) = open.pop() {
        if current == to {
            // Reconstruct path
            let mut path = vec![current];
            let mut node = current;
            while let Some(&prev) = came_from.get(&node) {
                path.push(prev);
                node = prev;
            }
            path.reverse();
            return Ok(path);
        }

        // Skip if we've found a better path to this node already
        if let Some(&best_g) = g_score.get(&current) {
            if g > best_g {
                continue;
            }
        }

        for neighbor in current.neighbors() {
            // Skip out-of-bounds
            if !grid.contains(&neighbor) {
                continue;
            }

            // Skip impassable terrain
            let cost = match grid.movement_cost(&neighbor) {
                Some(c) if c < u32::MAX => c,
                _ => continue,
            };

            // Skip enemy-blocked hexes
            if blocked.contains(&neighbor) {
                continue;
            }

            // Friendly-occupied: can transit through but not end on
            // (destination check is above; here we allow passing through)

            let tentative_g = g.saturating_add(cost);

            if tentative_g > max_cost {
                continue;
            }

            let current_best = g_score.get(&neighbor).copied().unwrap_or(u32::MAX);
            if tentative_g < current_best {
                g_score.insert(neighbor, tentative_g);
                came_from.insert(neighbor, current);
                let h = neighbor.distance(&to);
                open.push(Reverse((tentative_g + h, tentative_g, neighbor)));
            }
        }
    }

    Err(GameError::NoPath { from, to })
}

/// Find all hexes reachable from `from` within `max_cost` movement points.
pub fn reachable_hexes(
    grid: &HexGrid,
    from: Hex,
    max_cost: u32,
    blocked: &HashSet<Hex>,
    friendly_occupied: &HashSet<Hex>,
) -> Vec<(Hex, u32)> {
    let mut visited: HashMap<Hex, u32> = HashMap::new();
    let mut open = BinaryHeap::new();

    visited.insert(from, 0);
    open.push(Reverse((0u32, from)));

    while let Some(Reverse((cost, current))) = open.pop() {
        if let Some(&best) = visited.get(&current) {
            if cost > best {
                continue;
            }
        }

        for neighbor in current.neighbors() {
            if !grid.contains(&neighbor) {
                continue;
            }

            let move_cost = match grid.movement_cost(&neighbor) {
                Some(c) if c < u32::MAX => c,
                _ => continue,
            };

            if blocked.contains(&neighbor) {
                continue;
            }

            let new_cost = cost.saturating_add(move_cost);
            if new_cost > max_cost {
                continue;
            }

            let current_best = visited.get(&neighbor).copied().unwrap_or(u32::MAX);
            if new_cost < current_best {
                visited.insert(neighbor, new_cost);
                open.push(Reverse((new_cost, neighbor)));
            }
        }
    }

    // Filter out friendly-occupied hexes (can't end on them) and the start hex
    visited
        .into_iter()
        .filter(|(hex, _)| *hex != from && !friendly_occupied.contains(hex))
        .collect()
}

/// Calculate path cost (sum of terrain movement costs for all hexes in path except start).
pub fn path_cost(grid: &HexGrid, path: &[Hex]) -> u32 {
    if path.len() <= 1 {
        return 0;
    }
    path[1..]
        .iter()
        .map(|h| grid.movement_cost(h).unwrap_or(u32::MAX))
        .fold(0u32, |acc, c| acc.saturating_add(c))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::grid::Terrain;

    #[test]
    fn path_to_self() {
        let grid = HexGrid::new(3);
        let blocked = HashSet::new();
        let friendly = HashSet::new();
        let path = find_path(&grid, Hex::ORIGIN, Hex::ORIGIN, 10, &blocked, &friendly)
            .expect("path to self");
        assert_eq!(path, vec![Hex::ORIGIN]);
    }

    #[test]
    fn path_to_neighbor() {
        let grid = HexGrid::new(3);
        let blocked = HashSet::new();
        let friendly = HashSet::new();
        let target = Hex::new(1, 0);
        let path = find_path(&grid, Hex::ORIGIN, target, 10, &blocked, &friendly)
            .expect("path to neighbor");
        assert_eq!(path.len(), 2);
        assert_eq!(path[0], Hex::ORIGIN);
        assert_eq!(path[1], target);
    }

    #[test]
    fn path_around_obstacle() {
        let mut grid = HexGrid::new(3);
        grid.set_terrain(Hex::new(1, 0), Terrain::Mountain);
        let blocked = HashSet::new();
        let friendly = HashSet::new();
        let path = find_path(&grid, Hex::ORIGIN, Hex::new(2, 0), 10, &blocked, &friendly)
            .expect("path around mountain");
        // Should not go through (1,0)
        assert!(!path.contains(&Hex::new(1, 0)));
        assert!(path.len() > 2);
    }

    #[test]
    fn path_blocked_by_enemy() {
        let grid = HexGrid::new(3);
        let mut blocked = HashSet::new();
        blocked.insert(Hex::new(1, 0));
        let friendly = HashSet::new();
        let path = find_path(&grid, Hex::ORIGIN, Hex::new(2, 0), 10, &blocked, &friendly)
            .expect("path around enemy");
        assert!(!path.contains(&Hex::new(1, 0)));
    }

    #[test]
    fn path_through_friendly() {
        let grid = HexGrid::new(3);
        let blocked = HashSet::new();
        let mut friendly = HashSet::new();
        friendly.insert(Hex::new(1, 0));
        // Can transit through friendly
        let path = find_path(&grid, Hex::ORIGIN, Hex::new(2, 0), 10, &blocked, &friendly)
            .expect("path through friendly");
        assert!(path.contains(&Hex::new(1, 0))); // transits through
        assert_eq!(*path.last().expect("has last"), Hex::new(2, 0));
    }

    #[test]
    fn cannot_end_on_friendly() {
        let grid = HexGrid::new(3);
        let blocked = HashSet::new();
        let mut friendly = HashSet::new();
        friendly.insert(Hex::new(1, 0));
        let result = find_path(&grid, Hex::ORIGIN, Hex::new(1, 0), 10, &blocked, &friendly);
        assert!(result.is_err());
    }

    #[test]
    fn path_exceeds_max_cost() {
        let grid = HexGrid::new(5);
        let blocked = HashSet::new();
        let friendly = HashSet::new();
        // Distance 5, max_cost 2
        let result = find_path(&grid, Hex::ORIGIN, Hex::new(5, 0), 2, &blocked, &friendly);
        assert!(result.is_err());
    }

    #[test]
    fn forest_costs_more() {
        let mut grid = HexGrid::new(3);
        grid.set_terrain(Hex::new(1, 0), Terrain::Forest);
        let blocked = HashSet::new();
        let friendly = HashSet::new();
        let path = find_path(&grid, Hex::ORIGIN, Hex::new(1, 0), 10, &blocked, &friendly)
            .expect("path through forest");
        assert_eq!(path_cost(&grid, &path), 2); // forest costs 2
    }

    #[test]
    fn reachable_hexes_basic() {
        let grid = HexGrid::new(5);
        let blocked = HashSet::new();
        let friendly = HashSet::new();
        let reachable = reachable_hexes(&grid, Hex::ORIGIN, 1, &blocked, &friendly);
        // With movement 1 on all-plains, should reach 6 neighbors
        assert_eq!(reachable.len(), 6);
    }

    #[test]
    fn reachable_excludes_friendly_occupied() {
        let grid = HexGrid::new(5);
        let blocked = HashSet::new();
        let mut friendly = HashSet::new();
        friendly.insert(Hex::new(1, 0));
        let reachable = reachable_hexes(&grid, Hex::ORIGIN, 1, &blocked, &friendly);
        assert_eq!(reachable.len(), 5); // 6 minus the friendly-occupied one
        assert!(!reachable.iter().any(|(h, _)| *h == Hex::new(1, 0)));
    }

    #[test]
    fn path_cost_empty() {
        let grid = HexGrid::new(3);
        assert_eq!(path_cost(&grid, &[Hex::ORIGIN]), 0);
    }
}
