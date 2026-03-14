import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameScreen } from '../screens/GameScreen.js';
import { useGameStore } from '../stores/gameStore.js';
import { useConnectionStore } from '../stores/connectionStore.js';
import { useUIStore } from '../stores/uiStore.js';

const wasmApi = {
  updateState: vi.fn(),
  getReachableHexes: vi.fn(() => []),
  getAttackRangeHexes: vi.fn(() => []),
  getVisibleHexes: vi.fn(() => []),
  previewCombat: vi.fn(() => null),
  isReady: vi.fn(() => true),
};

vi.mock('../wasm/useWasmGame.js', () => ({
  useWasmGame: () => wasmApi,
}));

vi.mock('../renderer/GameCanvas.js', () => ({
  GameCanvas: () => <div data-testid="mock-game-canvas" />,
}));

vi.mock('../components/hud/TurnBar.js', () => ({
  TurnBar: () => <div data-testid="mock-turn-bar" />,
}));

vi.mock('../components/hud/UnitPanel.js', () => ({
  UnitPanel: () => null,
}));

vi.mock('../components/hud/UnitPicker.js', () => ({
  UnitPicker: () => null,
}));

vi.mock('../components/hud/ScoreBoard.js', () => ({
  ScoreBoard: () => null,
}));

vi.mock('../components/hud/OrderList.js', () => ({
  OrderList: () => null,
}));

vi.mock('../components/hud/GameLog.js', () => ({
  GameLog: () => null,
}));

vi.mock('../components/hud/MiniMap.js', () => ({
  MiniMap: () => null,
}));

vi.mock('../components/hud/combatPreview.js', () => ({
  CombatPreviewTooltip: () => null,
}));

vi.mock('../components/hud/combatPreviewData.js', () => ({
  buildCombatPreview: () => null,
}));

vi.mock('../components/HelpOverlay.js', () => ({
  HelpOverlay: () => null,
}));

describe('GameScreen', () => {
  beforeEach(() => {
    wasmApi.updateState.mockReset();
    wasmApi.getReachableHexes.mockReturnValue([]);
    wasmApi.getAttackRangeHexes.mockReturnValue([]);
    wasmApi.getVisibleHexes.mockReturnValue([]);
    wasmApi.previewCombat.mockReturnValue(null);

    useGameStore.setState({
      phase: 'planning',
      turn: 1,
      playerId: 0,
      units: new Map([
        [
          1,
          {
            id: 1,
            owner: 0,
            unitClass: 'infantry',
            hp: 100,
            maxHp: 100,
            attack: 10,
            defense: 5,
            moveRange: 3,
            attackRange: 1,
            coord: { q: 0, r: 0 },
          },
        ],
      ]),
      grid: {
        width: 1,
        height: 1,
        cells: [{ coord: { q: 0, r: 0 }, terrain: 'Plains', elevation: 0 }],
      },
      orders: [],
      spawnZone: [],
      availableUnits: [],
      turnTimerMs: 30000,
      winner: null,
      events: [],
      replayBytes: null,
      stateBytes: null,
    });

    useConnectionStore.setState({
      status: 'connected',
      ws: null,
      reconnectAttempts: 0,
      send: vi.fn(),
    });

    useUIStore.setState({
      selectedUnitId: null,
      hoveredHex: null,
      cameraX: 0,
      cameraY: 0,
      cameraZoom: 1,
      showGrid: true,
      showFog: true,
    });
  });

  it('pushes new state bytes into the WASM game bridge', async () => {
    render(<GameScreen />);

    const nextState = new Uint8Array([1, 2, 3, 4]);
    act(() => {
      useGameStore.getState().setStateBytes(nextState);
    });

    await waitFor(() => {
      expect(wasmApi.updateState).toHaveBeenCalledWith(nextState);
    });
  });
});
