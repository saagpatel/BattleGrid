import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useGameStore } from '../stores/gameStore.js';
import { useLobbyStore } from '../stores/lobbyStore.js';
import { GameOverScreen } from '../screens/GameOverScreen.js';

describe('GameOverScreen', () => {
  beforeEach(() => {
    useGameStore.setState({
      winner: 0,
      playerId: 0,
      turn: 5,
      units: new Map([
        [1, { id: 1, owner: 0, unitClass: 'infantry' as const, hp: 3, maxHp: 4, attack: 3, defense: 2, moveRange: 2, attackRange: 1, coord: { q: 0, r: 0 } }],
        [2, { id: 2, owner: 0, unitClass: 'archer' as const, hp: 0, maxHp: 3, attack: 2, defense: 1, moveRange: 2, attackRange: 3, coord: { q: 1, r: 0 } }],
        [3, { id: 3, owner: 1, unitClass: 'cavalry' as const, hp: 0, maxHp: 5, attack: 4, defense: 2, moveRange: 4, attackRange: 1, coord: { q: 2, r: 0 } }],
      ]),
      phase: 'finished' as const,
    });
    useLobbyStore.setState({
      currentRoom: {
        roomId: 'test',
        name: 'Test Room',
        config: { turnTimerMs: 30000, maxPlayers: 2, mapSeed: null },
        players: [
          { id: 0, name: 'Player 1', ready: true },
          { id: 1, name: 'Player 2', ready: true },
        ],
        status: 'finished',
      },
    });
  });

  it('shows victory when player wins', () => {
    render(<GameOverScreen />);
    expect(screen.getByText('Victory!')).toBeDefined();
  });

  it('shows defeat when opponent wins', () => {
    useGameStore.setState({ winner: 1 });
    render(<GameOverScreen />);
    expect(screen.getByText('Defeat')).toBeDefined();
  });

  it('shows draw when no winner', () => {
    useGameStore.setState({ winner: null });
    render(<GameOverScreen />);
    expect(screen.getByText('Draw')).toBeDefined();
  });

  it('displays final stats', () => {
    render(<GameOverScreen />);
    expect(screen.getByText('Turns Played')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
    expect(screen.getByText('Units Surviving')).toBeDefined();
    expect(screen.getByText('Units Lost')).toBeDefined();
    expect(screen.getByText('HP Remaining')).toBeDefined();
    expect(screen.getByText('3/7')).toBeDefined();
  });

  it('has return to lobby button', () => {
    render(<GameOverScreen />);
    expect(screen.getByText('Return to Lobby')).toBeDefined();
  });

  it('has disabled replay button when no replay data', () => {
    render(<GameOverScreen />);
    const replayButton = screen.getByText('Replay Unavailable');
    expect(replayButton.closest('button')?.disabled).toBe(true);
  });
});
