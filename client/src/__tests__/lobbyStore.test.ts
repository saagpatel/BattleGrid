import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLobbyStore } from '../stores/lobbyStore.js';
import type { RoomInfo, RoomDetails } from '../types/network.js';

// Mock localStorage
const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
});

describe('lobbyStore', () => {
  beforeEach(() => {
    storage.clear();
    useLobbyStore.setState({
      rooms: [],
      currentRoom: null,
      playerName: '',
    });
  });

  it('sets rooms', () => {
    const rooms: RoomInfo[] = [
      { roomId: 'abc', name: 'Test Room', playerCount: 1, maxPlayers: 2, status: 'waiting' },
    ];
    useLobbyStore.getState().setRooms(rooms);
    expect(useLobbyStore.getState().rooms).toEqual(rooms);
  });

  it('sets current room', () => {
    const room: RoomDetails = {
      roomId: 'abc',
      name: 'Test Room',
      config: { turnTimerMs: 30000, maxPlayers: 2, mapSeed: null },
      players: [{ id: 1, name: 'Alice', ready: false }],
      status: 'waiting',
    };
    useLobbyStore.getState().setCurrentRoom(room);
    expect(useLobbyStore.getState().currentRoom).toEqual(room);
  });

  it('clears current room', () => {
    useLobbyStore.getState().setCurrentRoom({
      roomId: 'abc',
      name: 'Test',
      config: { turnTimerMs: 30000, maxPlayers: 2, mapSeed: null },
      players: [],
      status: 'waiting',
    });
    useLobbyStore.getState().setCurrentRoom(null);
    expect(useLobbyStore.getState().currentRoom).toBeNull();
  });

  it('sets player name and persists to localStorage', () => {
    useLobbyStore.getState().setPlayerName('Bob');
    expect(useLobbyStore.getState().playerName).toBe('Bob');
    expect(storage.get('battleGrid:playerName')).toBe('Bob');
  });
});
