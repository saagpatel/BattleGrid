import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodeMessage, decodeMessage } from '../network/codec.js';
import type { ClientMessage, ServerMessage } from '../types/network.js';

const wasmMock = {
  encode_client_message: vi.fn<(msg: unknown) => Uint8Array>(),
  decode_server_message: vi.fn<(bytes: Uint8Array) => unknown>(),
};

let wasmEnabled = false;

vi.mock('../wasm/loader.js', () => ({
  getWasm: () => (wasmEnabled ? wasmMock : null),
}));

describe('codec', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wasmEnabled = false;
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

  it('uses structured message input when WASM is available', () => {
    wasmEnabled = true;
    wasmMock.encode_client_message.mockReturnValue(new Uint8Array([1, 2, 3]));

    const msg: ClientMessage = { type: 'ListRooms' };
    const encoded = encodeMessage(msg);

    expect(wasmMock.encode_client_message).toHaveBeenCalledWith('ListRooms');
    expect(encoded).toBeInstanceOf(ArrayBuffer);
  });

  it('maps create-room player names into the wire protocol', () => {
    wasmEnabled = true;
    wasmMock.encode_client_message.mockReturnValue(new Uint8Array([1, 2, 3]));

    const msg: ClientMessage = {
      type: 'CreateRoom',
      playerName: 'Alice',
      config: { turnTimerMs: 15000, maxPlayers: 2, mapSeed: null },
    };
    encodeMessage(msg);

    expect(wasmMock.encode_client_message).toHaveBeenCalledWith({
      CreateRoom: {
        player_name: 'Alice',
        config: {
          max_players: 2,
          turn_timer_ms: 15000,
          map_seed: null,
        },
      },
    });
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

  it('returns object payloads directly from WASM decode', () => {
    wasmEnabled = true;
    const msg: ServerMessage = { type: 'Pong' };
    wasmMock.decode_server_message.mockReturnValue(msg);

    const decoded = decodeMessage(new Uint8Array([1, 2]).buffer as ArrayBuffer);

    expect(decoded).toEqual(msg);
  });

  it('still supports string payloads from WASM decode', () => {
    wasmEnabled = true;
    const msg: ServerMessage = { type: 'Pong' };
    wasmMock.decode_server_message.mockReturnValue(JSON.stringify(msg));

    const decoded = decodeMessage(new Uint8Array([1, 2]).buffer as ArrayBuffer);

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
