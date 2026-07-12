import { useLiveQuery } from 'dexie-react-hooks';
import Sheet from '../../shared/Sheet';
import { useProjectStore } from '../../../state/projectStore';
import { useUIStore } from '../../../state/uiStore';
import { confirmAction } from '../../../state/dialogStore';
import { listSnapshots, snapshotProject } from '../../../db/db';
import type { SnapshotRecord } from '../../../types';

function relTime(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} d ago`;
}

export default function HistorySheet({ onClose }: { onClose: () => void }) {
  const doc = useProjectStore((s) => s.doc);
  const toast = useUIStore((s) => s.toast);
  const snaps = useLiveQuery(
    () => (doc ? listSnapshots(doc.id) : Promise.resolve([])),
    [doc?.id],
  );
  if (!doc) return null;
  const now = Date.now();

  const restore = async (snap: SnapshotRecord) => {
    const ok = await confirmAction({
      title: 'Restore this version?',
      message: 'Your current state is saved first, so you can undo the restore.',
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    useProjectStore.getState().restoreSnapshot(snap);
    toast('Version restored', 'success');
    onClose();
  };

  const saveNow = async () => {
    await useProjectStore.getState().save();
    await snapshotProject(doc, 'manual save');
    toast('Version saved', 'success');
  };

  return (
    <Sheet title="Version history" onClose={onClose}>
      <div className="space-y-3">
        <button className="btn-soft w-full" onClick={() => void saveNow()}>
          Save a version now
        </button>
        {snaps === undefined ? (
          <div className="text-sm text-ink-400">Loading…</div>
        ) : snaps.length === 0 ? (
          <div className="text-sm text-ink-400">
            No saved versions yet. Versions are captured automatically as you edit, and survive
            reloads.
          </div>
        ) : (
          <div className="space-y-1.5">
            {snaps.map((snap) => {
              const photos = snap.doc.layers.filter((l) => l.type === 'photo').length;
              return (
                <div
                  key={snap.id}
                  className="flex items-center gap-2 rounded-xl bg-ink-100 px-3 py-2 text-sm dark:bg-ink-800"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{relTime(snap.createdAt, now)}</div>
                    <div className="text-xs text-ink-400">
                      {snap.label ? `${snap.label} · ` : ''}
                      {snap.doc.panelCount} panels · {snap.doc.layers.length} layers ({photos}{' '}
                      photos)
                    </div>
                  </div>
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => void restore(snap)}>
                    Restore
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-ink-400">
          Auto-saved every minute of editing (up to 15 kept). This is separate from Undo, which
          steps through your current session.
        </p>
      </div>
    </Sheet>
  );
}
