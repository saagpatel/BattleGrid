import { getWasm } from '../wasm/loader.js';
import type { ClientMessage, ServerMessage } from '../types/network.js';

/**
 * Encode a client message for sending over WebSocket.
 * Uses WASM binary encoding when available, falls back to JSON.
 */
export function encodeMessage(msg: ClientMessage): ArrayBuffer | string {
  const wasm = getWasm();
  if (wasm) {
    const bytes = wasm.encode_client_message(JSON.stringify(msg));
    return bytes.buffer as ArrayBuffer;
  }
  return JSON.stringify(msg);
}

/**
 * Decode a server message received from WebSocket.
 * Uses WASM binary decoding when available, falls back to JSON.
 */
export function decodeMessage(data: ArrayBuffer | string): ServerMessage | null {
  try {
    if (typeof data === 'string') {
      return JSON.parse(data) as ServerMessage;
    }

    const wasm = getWasm();
    if (wasm) {
      const bytes = new Uint8Array(data);
      const json = wasm.decode_server_message(bytes);
      return JSON.parse(json) as ServerMessage;
    }

    // No WASM — try parsing binary data as UTF-8 JSON
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(data)) as ServerMessage;
  } catch (err) {
    console.error('Failed to decode server message:', err);
    return null;
  }
}
