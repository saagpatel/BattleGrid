import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodeMessage, decodeMessage } from '../network/codec.js';
import type { ClientMessage, ServerMessage } from '../types/network.js';

// Mock the WASM loader to return null (no WASM available)
vi.mock('../wasm/loader.js', () => ({
  getWasm: () => null,
}));

describe('codec (JSON fallback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('encodes a client message as JSON string when WASM not available', () => {
    const msg: ClientMessage = { type: 'ListRooms' };
    const encoded = encodeMessage(msg);
    expect(typeof encoded).toBe('string');
    expect(JSON.parse(encoded as string)).toEqual(msg);
  });

  it('encodes a complex client message', () => {
    const msg: ClientMessage = {
      type: 'SubmitOrders',
      turn: 3,
      orders: [{ unitId: 1, orderType: 'move', target: { q: 2, r: 1 } }],
    };
    const encoded = encodeMessage(msg);
    expect(JSON.parse(encoded as string)).toEqual(msg);
  });

  it('decodes a JSON string server message', () => {
    const msg: ServerMessage = { type: 'RoomList', rooms: [] };
    const decoded = decodeMessage(JSON.stringify(msg));
    expect(decoded).toEqual(msg);
  });

  it('decodes a binary ArrayBuffer as UTF-8 JSON when WASM not available', () => {
    const msg: ServerMessage = { type: 'Pong' };
    const encoder = new TextEncoder();
    const buffer = encoder.encode(JSON.stringify(msg)).buffer;
    const decoded = decodeMessage(buffer as ArrayBuffer);
    expect(decoded).toEqual(msg);
  });

  it('returns null for invalid data', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const decoded = decodeMessage('not json {{{');
    expect(decoded).toBeNull();
    consoleSpy.mockRestore();
  });

  it('decodes a complex server message', () => {
    const msg: ServerMessage = {
      type: 'PlanningPhase',
      turn: 5,
      units: [
        {
          id: 1,
          owner: 0,
          unitClass: 'infantry',
          hp: 10,
          maxHp: 10,
          attack: 3,
          defense: 2,
          moveRange: 2,
          attackRange: 1,
          coord: { q: 0, r: 0 },
        },
      ],
      timerMs: 30000,
    };
    const decoded = decodeMessage(JSON.stringify(msg));
    expect(decoded).toEqual(msg);
  });
});
