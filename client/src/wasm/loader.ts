/**
 * Async singleton WASM loader.
 * Returns null gracefully if the WASM module hasn't been built yet.
 */

// We type the module loosely here because the actual WASM pkg
// may not exist at compile time. The wasm-eng owns the real types.
interface WasmModule {
  decode_server_message: (data: Uint8Array) => string;
  encode_client_message: (json: string) => Uint8Array;
}

let wasmModule: WasmModule | null = null;
let initPromise: Promise<boolean> | null = null;

export async function initWasm(): Promise<boolean> {
  if (wasmModule) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Dynamic import — will fail gracefully if pkg doesn't exist.
      // The path variable prevents Vite's import analysis from failing
      // at transform time when the WASM pkg hasn't been built yet.
      const wasmPath = './pkg/battleground_wasm';
      const wasm = await import(/* @vite-ignore */ wasmPath);
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
