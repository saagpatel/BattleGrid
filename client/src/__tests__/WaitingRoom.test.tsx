import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WaitingRoom } from '../screens/WaitingRoom.js';
import { useLobbyStore } from '../stores/lobbyStore.js';
import { useConnectionStore } from '../stores/connectionStore.js';
import { useGameStore } from '../stores/gameStore.js';

vi.mock('../network/client.js', () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
}));

describe('WaitingRoom', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    useGameStore.getState().setPlayerId(1);
    useLobbyStore.setState({
      playerName: 'Alice',
      currentRoom: {
        roomId: 'ABCD',
        name: 'Test Room',
        config: { turnTimerMs: 30000, maxPlayers: 2, mapSeed: null },
        players: [
          { id: 1, name: 'Alice', ready: false },
          { id: 2, name: 'Bob', ready: true },
        ],
        status: 'waiting',
      },
    });
    useConnectionStore.setState({
      status: 'connected',
      ws: null,
      reconnectAttempts: 0,
    });
  });

  it('renders room name', () => {
    render(<WaitingRoom />);
    expect(screen.getByText('Test Room')).toBeInTheDocument();
  });

  it('shows room code', () => {
    render(<WaitingRoom />);
    expect(screen.getByText('ABCD')).toBeInTheDocument();
  });

  it('shows player names', () => {
    render(<WaitingRoom />);
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
  });

  it('shows waiting message when not all ready', () => {
    render(<WaitingRoom />);
    expect(
      screen.getByText('Waiting for all players to ready up...'),
    ).toBeInTheDocument();
  });

  it('shows all ready message when everyone is ready', () => {
    useLobbyStore.setState({
      currentRoom: {
        roomId: 'ABCD',
        name: 'Test Room',
        config: { turnTimerMs: 30000, maxPlayers: 2, mapSeed: null },
        players: [
          { id: 1, name: 'Alice', ready: true },
          { id: 2, name: 'Bob', ready: true },
        ],
        status: 'waiting',
      },
    });
    render(<WaitingRoom />);
    expect(screen.getByText('All players ready!')).toBeInTheDocument();
  });

  it('renders nothing when no room', () => {
    useLobbyStore.setState({ currentRoom: null });
    const { container } = render(<WaitingRoom />);
    expect(container.innerHTML).toBe('');
  });
});
