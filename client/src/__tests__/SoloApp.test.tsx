import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoloApp } from '../solo/SoloApp.js';
import type {
  LegalPuzzleOrder,
  PuzzleReplayFrame,
  PuzzleSessionApi,
  PuzzleState,
} from '../solo/types.js';

const mocks = vi.hoisted(() => ({
  createPuzzleSession: vi.fn(),
}));

vi.mock('../solo/sessionAdapter.js', () => ({
  createPuzzleSession: mocks.createPuzzleSession,
}));

const initialState: PuzzleState = {
  turn: 1,
  terrain: [
    { coord: { q: -1, r: 0 }, terrain: 'Plains' },
    { coord: { q: 0, r: 0 }, terrain: 'Fortress' },
    { coord: { q: 1, r: 0 }, terrain: 'Plains' },
  ],
  units: [
    {
      id: 1,
      owner: 0,
      unit_type: 'Scout',
      coord: { q: -1, r: 0 },
      hp: 2,
      max_hp: 2,
    },
    {
      id: 2,
      owner: 1,
      unit_type: 'Scout',
      coord: { q: 1, r: 0 },
      hp: 2,
      max_hp: 2,
    },
  ],
};

const moveOrder: LegalPuzzleOrder = {
  unit_id: 1,
  order_kind: 'move',
  path: [
    { q: -1, r: 0 },
    { q: 0, r: 0 },
  ],
  target: { q: 0, r: 0 },
  target_unit_id: null,
  movement_cost: 1,
  label: 'Move to (0, 0) (1 movement)',
};

const resolvedFrame: PuzzleReplayFrame = {
  turn_index: 1,
  state: { ...initialState, turn: 2 },
  events: [{ MovementConflict: { unit_a: 1, unit_b: 2 } }],
  event_explanations: [
    'Units 1 and 2 collided at (0, 0); both stayed in place and took 1 damage.',
  ],
  orders: { 0: [], 1: [] },
  result: {
    outcome: 'success',
    reason: 'Success: both sides contested (0, 0) in the same resolution.',
    challenge_results: [],
  },
  state_digest: 'state-digest',
  frame_digest: '12345678abcdef00',
};

function fakeSession(): PuzzleSessionApi {
  let queued = false;
  let committed = false;
  return {
    free: vi.fn(),
    definition: vi.fn(),
    compatibility: vi.fn(),
    digests: vi.fn(),
    current_state: vi.fn(() => initialState),
    player_units: vi.fn(() => [initialState.units[0]!]),
    legal_orders: vi.fn(() => [moveOrder]),
    preview_order: vi.fn(),
    queue_order: vi.fn(() => {
      queued = true;
      return { valid: true, error: null };
    }),
    remove_order: vi.fn(() => {
      queued = false;
      return true;
    }),
    queued_orders: vi.fn(() => []),
    validate_commit: vi.fn(() =>
      queued
        ? { valid: true, error: null }
        : {
            valid: false,
            error: {
              code: 'invalid_commit',
              message: 'queue exactly 1 order(s) before committing',
              order_errors: [],
            },
          },
    ),
    commit: vi.fn(() => {
      committed = true;
      return { ok: true, frame: resolvedFrame, error: null };
    }),
    result: vi.fn(() => resolvedFrame.result),
    replay_frame: vi.fn(() => resolvedFrame),
    replay_frame_count: vi.fn(() => (committed ? 1 : 0)),
    reset: vi.fn(() => {
      queued = false;
      committed = false;
    }),
  };
}

async function openCollisionPlanning() {
  fireEvent.click(screen.getAllByRole('button', { name: /Open briefing/i })[0]!);
  fireEvent.click(screen.getByRole('button', { name: /Start planning/i }));
  await screen.findByRole('heading', { name: 'Select a friendly unit' });
}

describe('SoloApp', { timeout: 15_000 }, () => {
  beforeEach(() => {
    mocks.createPuzzleSession.mockReset();
    mocks.createPuzzleSession.mockResolvedValue(fakeSession());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('completes selector → briefing → planning → commit → replay → result and retries', async () => {
    render(<SoloApp />);
    await openCollisionPlanning();

    fireEvent.click(screen.getByRole('button', { name: /Friendly Scout 1/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    fireEvent.click(screen.getByRole('button', { name: /Move to \(0, 0\)/i }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '1 / 1 ready' })).toHaveFocus(),
    );
    expect(screen.queryByRole('heading', { name: 'Legal destinations' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Commit orders/i }));

    const resultHeading = await screen.findByRole('heading', { name: 'Objective achieved' });
    expect(resultHeading).toHaveFocus();
    expect(screen.getByText(/collided at \(0, 0\)/i)).toBeInTheDocument();
    expect(screen.getByText(/triggering the collision rule/i)).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Replay frame' })).toHaveValue('1');

    fireEvent.click(screen.getAllByRole('button', { name: /Retry/i })[0]!);
    expect(await screen.findByRole('heading', { name: 'Select a friendly unit' })).toBeInTheDocument();
    expect(screen.getByText('No orders queued yet.')).toBeInTheDocument();
  });

  it('announces and focuses invalid commit feedback', async () => {
    render(<SoloApp />);
    await openCollisionPlanning();
    fireEvent.click(screen.getByRole('button', { name: /Commit orders/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('queue exactly 1 order');
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('remains playable when browser storage rejects progress writes', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    render(<SoloApp />);
    await openCollisionPlanning();
    fireEvent.click(screen.getByRole('button', { name: /Friendly Scout 1/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    fireEvent.click(screen.getByRole('button', { name: /Move to \(0, 0\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /Commit orders/i }));
    expect(await screen.findByRole('heading', { name: 'Objective achieved' })).toBeInTheDocument();
  });
});
