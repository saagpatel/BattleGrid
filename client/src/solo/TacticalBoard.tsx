import type { HexCoord, PuzzleState } from './types.js';

interface TacticalBoardProps {
  state: PuzzleState;
  playerSide: number;
  selectedUnitId: number | null;
  selectedPath: HexCoord[];
  objectiveCoord: HexCoord;
  onSelectUnit?: (unitId: number) => void;
}

function position(coord: HexCoord) {
  return {
    left: `${50 + coord.q * 16}%`,
    top: `${50 + (coord.r + coord.q / 2) * 18}%`,
  };
}

function sameHex(left: HexCoord, right: HexCoord) {
  return left.q === right.q && left.r === right.r;
}

export function TacticalBoard({
  state,
  playerSide,
  selectedUnitId,
  selectedPath,
  objectiveCoord,
  onSelectUnit,
}: TacticalBoardProps) {
  const orderedUnits = [...state.units].sort((a, b) => a.id - b.id);
  const terrainByCoord = new Map(
    state.terrain.map((cell) => [`${cell.coord.q}:${cell.coord.r}`, cell.terrain]),
  );
  const notableTerrain = state.terrain.filter(
    (cell) => cell.terrain !== 'Plains' && !sameHex(cell.coord, objectiveCoord),
  );
  const objectiveTerrain = terrainByCoord.get(`${objectiveCoord.q}:${objectiveCoord.r}`) ?? 'Unknown';

  return (
    <section className="board-region" aria-labelledby="board-heading">
      <div className="section-heading">
        <div>
          <p className="section-label">Battlefield</p>
          <h2 id="board-heading">Resolution board</h2>
        </div>
        <p className="turn-readout">Turn {state.turn}</p>
      </div>

      <div className="tactical-board" data-testid="tactical-board">
        <div className="board-legend" aria-hidden="true">
          <span><i className="legend-shape player" /> Player</span>
          <span><i className="legend-shape enemy" /> Enemy</span>
          <span><i className="legend-shape objective" /> Objective</span>
        </div>
        <div className="hex-field" aria-hidden="true">
          {state.terrain.map((cell) => {
            const onPath = selectedPath.some((coord) => sameHex(coord, cell.coord));
            const objective = sameHex(objectiveCoord, cell.coord);
            return (
              <div
                className={`hex-cell terrain-${cell.terrain.toLowerCase()}${onPath ? ' is-path' : ''}${objective ? ' is-objective' : ''}`}
                style={position(cell.coord)}
                key={`${cell.coord.q}:${cell.coord.r}`}
              >
                <span>{objective ? '◎' : ''}</span>
              </div>
            );
          })}
        </div>
        <div className="unit-layer">
          {orderedUnits.map((unit) => {
            const friendly = unit.owner === playerSide;
            const selected = unit.id === selectedUnitId;
            const terrain = terrainByCoord.get(`${unit.coord.q}:${unit.coord.r}`) ?? 'Unknown';
            const objective = sameHex(objectiveCoord, unit.coord);
            const label = `${friendly ? 'Friendly' : 'Enemy'} ${unit.unit_type} ${unit.id}, ${unit.hp} of ${unit.max_hp} HP, at ${unit.coord.q}, ${unit.coord.r}, on ${terrain} terrain${objective ? ', objective hex' : ''}`;
            return (
              <button
                type="button"
                key={unit.id}
                className={`board-unit ${friendly ? 'is-player' : 'is-enemy'}${selected ? ' is-selected' : ''}`}
                style={position(unit.coord)}
                aria-label={label}
                aria-pressed={friendly ? selected : undefined}
                disabled={!friendly || !onSelectUnit}
                onClick={() => onSelectUnit?.(unit.id)}
              >
                <span className="unit-symbol" aria-hidden="true">
                  {friendly ? '▲' : '▼'}
                </span>
                <span className="unit-id">{unit.id}</span>
              </button>
            );
          })}
        </div>
      </div>

      <details className="board-summary" open>
        <summary>Text board summary</summary>
        <ol>
          {orderedUnits.map((unit) => (
            <li key={unit.id}>
              {unit.owner === playerSide ? 'Friendly' : 'Enemy'} {unit.unit_type} {unit.id}: {unit.hp}/
              {unit.max_hp} HP at ({unit.coord.q}, {unit.coord.r}) on{' '}
              {terrainByCoord.get(`${unit.coord.q}:${unit.coord.r}`) ?? 'Unknown'} terrain
              {sameHex(objectiveCoord, unit.coord) ? ' at the objective hex' : ''}.
            </li>
          ))}
        </ol>
        <h3>Terrain and markers</h3>
        <ul>
          <li>
            Objective hex: ({objectiveCoord.q}, {objectiveCoord.r}) on {objectiveTerrain} terrain.
          </li>
          {notableTerrain.map((cell) => (
            <li key={`${cell.coord.q}:${cell.coord.r}`}>
              {cell.terrain} terrain at ({cell.coord.q}, {cell.coord.r}).
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
