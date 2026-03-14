import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App.js';
import { useConnectionStore } from '../stores/connectionStore.js';
import { useLobbyStore } from '../stores/lobbyStore.js';
import { useGameStore } from '../stores/gameStore.js';

const mocks = vi.hoisted(() => ({
  initWasm: vi.fn(),
  connect: vi.fn(),
}));

vi.mock('../wasm/loader.js', () => ({
  initWasm: mocks.initWasm,
}));

vi.mock('../network/client.js', () => ({
  connect: mocks.connect,
}));

vi.mock('../screens/LobbyScreen.js', () => ({
  LobbyScreen: () => <div data-testid="mock-lobby-screen">Lobby</div>,
}));

vi.mock('../screens/WaitingRoom.js', () => ({
  WaitingRoom: () => <div data-testid="mock-waiting-room">Waiting</div>,
}));

vi.mock('../screens/DeploymentScreen.js', () => ({
  DeploymentScreen: () => <div data-testid="mock-deployment-screen">Deployment</div>,
}));

vi.mock('../screens/GameScreen.js', () => ({
  GameScreen: () => <div data-testid="mock-game-screen">Game</div>,
}));

vi.mock('../screens/GameOverScreen.js', () => ({
  GameOverScreen: () => <div data-testid="mock-game-over-screen">Game Over</div>,
}));

vi.mock('../components/Toast.js', () => ({
  ToastContainer: () => null,
}));

describe('App', () => {
  beforeEach(() => {
    mocks.initWasm.mockReset();
    mocks.connect.mockReset();

    useConnectionStore.setState({
      status: 'connected',
      ws: null,
      reconnectAttempts: 0,
      send: vi.fn(),
    });

    useLobbyStore.setState({
      rooms: [],
      currentRoom: null,
      playerName: 'Tester',
    });

    useGameStore.getState().reset();
  });

  it('shows the WASM failure screen and skips connection when bootstrap fails', async () => {
    mocks.initWasm.mockResolvedValue(false);

    render(<App />);

    expect(await screen.findByText('Game Engine Unavailable')).toBeInTheDocument();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('connects only after the WASM bootstrap succeeds', async () => {
    mocks.initWasm.mockResolvedValue(true);

    render(<App />);

    await waitFor(() => {
      expect(mocks.connect).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByTestId('mock-lobby-screen')).toBeInTheDocument();
  });
});
