import collisionCourse from '../puzzles/collision-course.v1.json';
import holdTheLine from '../puzzles/hold-the-line.v1.json';
import openTheShot from '../puzzles/open-the-shot.v1.json';
import type { PuzzleCatalogEntry, PuzzleDefinition } from './types.js';

function entry(definition: unknown): PuzzleCatalogEntry {
  return {
    definition: definition as PuzzleDefinition,
    raw: JSON.stringify(definition),
  };
}

export const puzzleCatalog = [
  entry(collisionCourse),
  entry(holdTheLine),
  entry(openTheShot),
] as const;
