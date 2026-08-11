import { getWasm, initWasm } from '../wasm/loader.js';
import type { PuzzleSessionApi } from './types.js';

export async function createPuzzleSession(definitionJson: string): Promise<PuzzleSessionApi> {
  const ready = await initWasm();
  const wasm = getWasm();
  if (!ready || !wasm?.WasmPuzzleSession) {
    throw new Error(
      'The BattleGrid WebAssembly puzzle engine is unavailable. Rebuild the static WASM package and reload.',
    );
  }
  return new wasm.WasmPuzzleSession(definitionJson);
}
