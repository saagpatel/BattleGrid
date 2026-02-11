import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectionStore } from '../stores/connectionStore.js';

const encodeMessageMock = vi.fn();

vi.mock('../network/codec.js', () => ({
  encodeMessage: (msg: unknown) => encodeMessageMock(msg),
}));

describe('connectionStore.send', () => {
  beforeEach(() => {
    useConnectionStore.setState({
      status: 'disconnected',
      ws: null,
      reconnectAttempts: 0,
    });
    encodeMessageMock.mockReset();
  });

  it('does not send when disconnected', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    useConnectionStore.getState().send({ type: 'ListRooms' });

    expect(warnSpy).toHaveBeenCalledWith('Cannot send: not connected');
    expect(encodeMessageMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('encodes messages before sending to websocket', () => {
    const ws = { send: vi.fn(), close: vi.fn() } as unknown as WebSocket;
    const encoded = new ArrayBuffer(8);
    encodeMessageMock.mockReturnValue(encoded);

    useConnectionStore.setState({ status: 'connected', ws });
    const message = { type: 'ListRooms' } as const;

    useConnectionStore.getState().send(message);

    expect(encodeMessageMock).toHaveBeenCalledWith(message);
    expect(ws.send).toHaveBeenCalledWith(encoded);
  });
});
