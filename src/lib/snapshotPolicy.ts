// ---------------------------------------------------------------------------
// Policy for durable revision snapshots. Pure so it's unit-testable; the store
// owns the actual timing/persistence. Snapshots are coarse (throttled) and
// capped per project — they complement, not replace, the in-memory undo stack.
// ---------------------------------------------------------------------------

/** minimum spacing between durable snapshots of the same project */
export const SNAPSHOT_INTERVAL_MS = 60_000;

/** how many snapshots to keep per project (oldest pruned) */
export const MAX_SNAPSHOTS = 15;

/**
 * Whether a new snapshot is due. The first save of a project (no prior
 * snapshot) always snapshots so there's a restore point immediately.
 */
export function shouldSnapshot(
  lastAt: number | undefined,
  now: number,
  interval = SNAPSHOT_INTERVAL_MS,
): boolean {
  return lastAt === undefined || now - lastAt >= interval;
}
