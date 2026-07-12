import { describe, it, expect } from 'vitest';
import { shouldSnapshot, SNAPSHOT_INTERVAL_MS } from './snapshotPolicy';

describe('shouldSnapshot', () => {
  it('always snapshots the first time (no prior snapshot)', () => {
    expect(shouldSnapshot(undefined, 1_000)).toBe(true);
  });

  it('waits for the interval to elapse', () => {
    const t0 = 1_000_000;
    expect(shouldSnapshot(t0, t0 + SNAPSHOT_INTERVAL_MS - 1)).toBe(false);
    expect(shouldSnapshot(t0, t0 + SNAPSHOT_INTERVAL_MS)).toBe(true);
  });

  it('honors a custom interval', () => {
    expect(shouldSnapshot(0, 500, 1000)).toBe(false);
    expect(shouldSnapshot(0, 1000, 1000)).toBe(true);
  });
});
