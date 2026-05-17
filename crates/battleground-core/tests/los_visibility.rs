use battleground_core::{
    grid::{HexGrid, Terrain},
    hex::Hex,
    los::has_line_of_sight,
};

#[test]
fn line_of_sight_remains_clear_through_fortress() {
    let mut grid = HexGrid::new(5);
    grid.set_terrain(Hex::new(1, 0), Terrain::Fortress);

    assert!(has_line_of_sight(&grid, Hex::ORIGIN, Hex::new(2, 0)));
}