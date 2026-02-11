import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LobbyScreen } from '../screens/LobbyScreen.js';
import { useLobbyStore } from '../stores/lobbyStore.js';
import { useConnectionStore } from '../stores/connectionStore.js';

// Mock the network client
vi.mock('../network/client.js', () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
}));

describe('LobbyScreen', () => {
  const sendMock = vi.fn();

  beforeEach(() => {
    sendMock.mockReset();

    useLobbyStore.setState({
      rooms: [],
      currentRoom: null,
      playerName: 'TestPlayer',
    });
    useConnectionStore.setState({
      status: 'connected',
      ws: null,
      reconnectAttempts: 0,
      send: sendMock,
    });
  });

  it('renders the title', () => {
    render(<LobbyScreen />);
    expect(screen.getByText('BattleGrid')).toBeInTheDocument();
  });

  it('renders the player name input with stored name', () => {
    render(<LobbyScreen />);
    const input = screen.getByLabelText('Your Name');
    expect(input).toHaveValue('TestPlayer');
  });

  it('shows empty room message when no rooms', () => {
    render(<LobbyScreen />);
    expect(
      screen.getByText('No rooms available. Create one to get started!'),
    ).toBeInTheDocument();
  });

  it('renders room list and falls back to room id when room name is missing', () => {
    useLobbyStore.setState({
      rooms: [
        { roomId: 'abc', playerCount: 1, maxPlayers: 2, status: 'waiting' },
        { roomId: 'def', name: 'Room Two', playerCount: 2, maxPlayers: 2, status: 'in_progress' },
      ],
    });
    render(<LobbyScreen />);
    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.getByText('Room Two')).toBeInTheDocument();
  });

  it('shows connecting status', () => {
    useConnectionStore.setState({ status: 'connecting' });
    render(<LobbyScreen />);
    expect(screen.getByText('Connecting to server...')).toBeInTheDocument();
  });

  it('disables buttons when disconnected', () => {
    useConnectionStore.setState({ status: 'disconnected' });
    render(<LobbyScreen />);
    const createBtn = screen.getByText('Create Room');
    expect(createBtn.closest('button')).toBeDisabled();
  });

  it('sends quick match request with current player name', () => {
    render(<LobbyScreen />);

    fireEvent.click(screen.getByRole('button', { name: /quick match/i }));

    expect(sendMock).toHaveBeenCalledWith({ type: 'QuickMatch', playerName: 'TestPlayer' });
  });
});
