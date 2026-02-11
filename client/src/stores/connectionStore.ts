import { create } from 'zustand';
import type { ClientMessage } from '../types/network.js';
import { encodeMessage } from '../network/codec.js';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export interface ConnectionState {
  status: ConnectionStatus;
  ws: WebSocket | null;
  reconnectAttempts: number;

  setStatus: (status: ConnectionStatus) => void;
  setWs: (ws: WebSocket | null) => void;
  incrementReconnect: () => void;
  resetReconnect: () => void;
  send: (message: ClientMessage) => void;
  disconnect: () => void;
}

export const useConnectionStore = create<ConnectionState>()((set, get) => ({
  status: 'disconnected',
  ws: null,
  reconnectAttempts: 0,

  setStatus: (status) => set({ status }),
  setWs: (ws) => set({ ws }),
  incrementReconnect: () =>
    set((s) => ({ reconnectAttempts: s.reconnectAttempts + 1 })),
  resetReconnect: () => set({ reconnectAttempts: 0 }),

  send: (message) => {
    const { ws, status } = get();
    if (!ws || status !== 'connected') {
      console.warn('Cannot send: not connected');
      return;
    }

    ws.send(encodeMessage(message));
  },

  disconnect: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
    }
    set({ ws: null, status: 'disconnected', reconnectAttempts: 0 });
  },
}));
