/**
 * Async singleton WASM loader.
 * Returns null gracefully if the WASM module hasn't been built yet.
 */

// We type the module loosely here because the actual WASM pkg
// may not exist at compile time. The wasm-eng owns the real types.
// decode returns a JS object (ServerMessage), encode accepts a JS object (ClientMessage).
interface WasmModule {
  decode_server_message: (data: Uint8Array) => unknown;
  encode_client_message: (msg: unknown) => Uint8Array;
  decode_replay_summary?: (data: Uint8Array) => unknown;
  decode_game_state?: (data: Uint8Array) => unknown;
  decode_sim_events?: (data: Uint8Array) => unknown;
  encode_turn_orders?: (orders: unknown) => Uint8Array;
  WasmGame?: { new (bytes: Uint8Array): unknown };
  hex_to_pixel?: (q: number, r: number, hex_size: number) => unknown;
  pixel_to_hex?: (x: number, y: number, hex_size: number) => unknown;
  hex_distance?: (q1: number, r1: number, q2: number, r2: number) => number;
}

let wasmModule: WasmModule | null = null;
let initPromise: Promise<boolean> | null = null;
const wasmModuleLoaders = import.meta.glob('./pkg/battleground_wasm.js');

export async function initWasm(): Promise<boolean> {
  if (wasmModule) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Use a build-visible import so Vite includes the JS + .wasm asset in production,
      // while still allowing a graceful "not built yet" fallback during local setup.
      const loadWasmModule = wasmModuleLoaders['./pkg/battleground_wasm.js'];
      if (!loadWasmModule) {
        console.warn('WASM module not available — build the wasm pkg and reload the app');
        return false;
      }
      const wasm = (await loadWasmModule()) as WasmModule & {
        default?: () => Promise<void> | void;
      };
      if (typeof wasm.default === 'function') {
        await wasm.default();
      }
      wasmModule = wasm as unknown as WasmModule;
      return true;
    } catch {
      console.warn('WASM module not available — falling back to JSON codec');
      return false;
    }
  })();

  return initPromise;
}

export function getWasm(): WasmModule | null {
  return wasmModule;
}
