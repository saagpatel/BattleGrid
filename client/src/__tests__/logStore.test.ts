import { describe, it, expect, beforeEach } from 'vitest';
import { useLogStore } from '../stores/logStore.js';

describe('logStore', () => {
  beforeEach(() => {
    useLogStore.setState({ entries: [], nextId: 1 });
  });

  it('adds a log entry', () => {
    useLogStore.getState().addEntry(1, 'Unit moved', 'move');
    const entries = useLogStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].turn).toBe(1);
    expect(entries[0].text).toBe('Unit moved');
    expect(entries[0].kind).toBe('move');
    expect(entries[0].id).toBe(1);
  });

  it('increments id for each entry', () => {
    const { addEntry } = useLogStore.getState();
    addEntry(1, 'First', 'move');
    addEntry(1, 'Second', 'attack');
    const entries = useLogStore.getState().entries;
    expect(entries[0].id).toBe(1);
    expect(entries[1].id).toBe(2);
  });

  it('caps entries at 200', () => {
    const { addEntry } = useLogStore.getState();
    for (let i = 0; i < 210; i++) {
      addEntry(1, `Entry ${i}`, 'system');
    }
    const entries = useLogStore.getState().entries;
    expect(entries).toHaveLength(200);
    // Oldest entries trimmed — first entry should be #11 (10 trimmed)
    expect(entries[0].text).toBe('Entry 10');
  });

  it('clears all entries', () => {
    useLogStore.getState().addEntry(1, 'test', 'move');
    useLogStore.getState().clear();
    expect(useLogStore.getState().entries).toHaveLength(0);
    expect(useLogStore.getState().nextId).toBe(1);
  });

  it('stores timestamp on entries', () => {
    const before = Date.now();
    useLogStore.getState().addEntry(3, 'timed', 'heal');
    const after = Date.now();
    const entry = useLogStore.getState().entries[0];
    expect(entry.timestamp).toBeGreaterThanOrEqual(before);
    expect(entry.timestamp).toBeLessThanOrEqual(after);
  });
});
