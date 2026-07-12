// ---------------------------------------------------------------------------
// Editor document store with 50-step undo history and Dexie autosave.
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import { db, snapshotProject, uid } from '../db/db';
import type {
  Background,
  Layer,
  PanelAspect,
  ProjectDoc,
  ProjectMode,
  SnapshotRecord,
} from '../types';
import { geometryOf } from '../lib/slicer';
import { resizeDoc } from '../lib/resize';
import { normalizeProjectDoc } from '../lib/projectSchema';
import { MAX_SNAPSHOTS, shouldSnapshot } from '../lib/snapshotPolicy';

const HISTORY_LIMIT = 50;

// per-project time of the last durable snapshot (module-scoped runtime state)
const lastSnapshotAt = new Map<string, number>();

interface ProjectState {
  doc: ProjectDoc | null;
  selectedIds: string[];
  past: ProjectDoc[];
  future: ProjectDoc[];
  dirty: boolean;
  /** doc as it was before the current preview() run started (null = no preview active) */
  previewBase: ProjectDoc | null;

  newProject: (
    name: string,
    mode: ProjectMode,
    aspect: PanelAspect,
    panelCount: number,
    panelWidth: number,
    panelHeight: number,
  ) => ProjectDoc;
  loadProject: (doc: ProjectDoc) => void;
  closeProject: () => void;
  /** re-flow the whole doc to a new panel size (one undo step) */
  resizeProject: (panelWidth: number, panelHeight: number, aspect: string) => void;
  /** revert the project to a durable snapshot (snapshots current first) */
  restoreSnapshot: (snap: SnapshotRecord) => void;

  /** Replace the doc, pushing the pre-edit state onto the undo stack. */
  commit: (updater: (doc: ProjectDoc) => ProjectDoc) => void;
  /**
   * Mutate without a history entry (slider drags, typing). The first preview
   * after a commit snapshots the base doc; a later commit()/commitPreview()
   * pushes that base — not the previewed doc — so the whole gesture undoes
   * as one step.
   */
  preview: (updater: (doc: ProjectDoc) => ProjectDoc) => void;
  /** Finish a preview gesture: one history entry for the whole gesture. */
  commitPreview: () => void;
  undo: () => void;
  redo: () => void;

  select: (ids: string[]) => void;
  updateLayers: (
    ids: string[],
    patch: (layer: Layer) => Layer,
    options?: { transient?: boolean },
  ) => void;
  addLayer: (layer: Layer) => void;
  removeLayers: (ids: string[]) => void;
  duplicateLayers: (ids: string[]) => void;
  reorderLayer: (id: string, dir: 'up' | 'down' | 'front' | 'back') => void;
  setBackground: (bg: Background) => void;

  save: () => Promise<void>;
  markSaved: () => void;
}

export function makeProjectDoc(
  name: string,
  mode: ProjectMode,
  aspect: PanelAspect,
  panelCount: number,
  panelWidth = 1080,
  panelHeight = 1350,
): ProjectDoc {
  const grid = mode === 'grid';
  return {
    id: uid(),
    name,
    mode,
    aspect: grid ? '1:1' : aspect,
    // grid tiles are always square 1080; carousel uses the requested size
    panelWidth: grid ? 1080 : panelWidth,
    panelHeight: grid ? 1080 : panelHeight,
    panelCount,
    background: { kind: 'solid', color: '#ffffff' },
    layers: [],
    captions: Array.from({ length: grid ? 1 : panelCount }, () => ''),
    gutter: 24,
    margin: 48,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  doc: null,
  selectedIds: [],
  past: [],
  future: [],
  dirty: false,
  previewBase: null,

  newProject: (name, mode, aspect, panelCount, panelWidth, panelHeight) => {
    const doc = makeProjectDoc(name, mode, aspect, panelCount, panelWidth, panelHeight);
    set({ doc, past: [], future: [], selectedIds: [], dirty: true, previewBase: null });
    void db.projects.put(doc);
    return doc;
  },

  // hydrate geometry for docs saved before panelWidth/panelHeight existed —
  // this is the single funnel for DB, recap, and import loads
  loadProject: (doc) =>
    set({
      doc: { ...doc, ...geometryOf(doc) },
      past: [],
      future: [],
      selectedIds: [],
      dirty: false,
      previewBase: null,
    }),

  closeProject: () =>
    set({ doc: null, past: [], future: [], selectedIds: [], dirty: false, previewBase: null }),

  resizeProject: (panelWidth, panelHeight, aspect) => {
    get().commit((doc) => resizeDoc(doc, panelWidth, panelHeight, aspect));
    get().select([]);
  },

  restoreSnapshot: (snap) => {
    const { doc } = get();
    // snapshot the current state first so the restore is itself reversible
    if (doc) void snapshotProject(doc, 'before restore');
    // round-trip through the normalizer so a hand-edited/old snapshot can't
    // white-screen the editor, and hydrate geometry for very old docs
    const restored = normalizeProjectDoc(structuredClone(snap.doc));
    set({
      doc: { ...restored, ...geometryOf(restored), updatedAt: Date.now() },
      past: [],
      future: [],
      selectedIds: [],
      previewBase: null,
      dirty: true,
    });
    void db.projects.put(get().doc as ProjectDoc);
  },

  commit: (updater) => {
    const { doc, past, previewBase } = get();
    if (!doc) return;
    const base = previewBase ?? doc;
    const next = { ...updater(doc), updatedAt: Date.now() };
    set({
      doc: next,
      past: [...past.slice(-(HISTORY_LIMIT - 1)), base],
      future: [],
      dirty: true,
      previewBase: null,
    });
  },

  preview: (updater) => {
    const { doc, previewBase } = get();
    if (!doc) return;
    set({ doc: updater(doc), dirty: true, previewBase: previewBase ?? doc });
  },

  commitPreview: () => {
    const { doc, past, previewBase } = get();
    if (!doc || !previewBase) return; // nothing previewed — no history noise
    set({
      doc: { ...doc, updatedAt: Date.now() },
      past: [...past.slice(-(HISTORY_LIMIT - 1)), previewBase],
      future: [],
      dirty: true,
      previewBase: null,
    });
  },

  undo: () => {
    const { doc, past, future, previewBase } = get();
    if (!doc) return;
    // an uncommitted preview undoes back to its base first
    if (previewBase) {
      set({ doc: previewBase, previewBase: null, dirty: true });
      return;
    }
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      doc: prev,
      past: past.slice(0, -1),
      future: [doc, ...future].slice(0, HISTORY_LIMIT),
      dirty: true,
      selectedIds: get().selectedIds.filter((id) => prev.layers.some((l) => l.id === id)),
    });
  },

  redo: () => {
    const { doc, past, future } = get();
    if (!doc || future.length === 0) return;
    const next = future[0];
    set({
      doc: next,
      past: [...past.slice(-(HISTORY_LIMIT - 1)), doc],
      future: future.slice(1),
      dirty: true,
      previewBase: null,
    });
  },

  select: (ids) => set({ selectedIds: ids }),

  updateLayers: (ids, patch, options) => {
    const apply = (doc: ProjectDoc): ProjectDoc => ({
      ...doc,
      layers: doc.layers.map((l) => (ids.includes(l.id) ? patch(l) : l)),
    });
    if (options?.transient) get().preview(apply);
    else get().commit(apply);
  },

  addLayer: (layer) => {
    get().commit((doc) => ({ ...doc, layers: [...doc.layers, layer] }));
    set({ selectedIds: [layer.id] });
  },

  removeLayers: (ids) => {
    get().commit((doc) => ({
      ...doc,
      layers: doc.layers.filter((l) => !ids.includes(l.id)),
    }));
    set({ selectedIds: [] });
  },

  duplicateLayers: (ids) => {
    const { doc } = get();
    if (!doc) return;
    const clones: Layer[] = doc.layers
      .filter((l) => ids.includes(l.id))
      .map((l) => ({ ...l, id: uid(), x: l.x + 40, y: l.y + 40 }));
    get().commit((d) => ({ ...d, layers: [...d.layers, ...clones] }));
    set({ selectedIds: clones.map((c) => c.id) });
  },

  reorderLayer: (id, dir) => {
    get().commit((doc) => {
      const layers = [...doc.layers];
      const i = layers.findIndex((l) => l.id === id);
      if (i < 0) return doc;
      const [layer] = layers.splice(i, 1);
      const target =
        dir === 'front'
          ? layers.length
          : dir === 'back'
            ? 0
            : dir === 'up'
              ? Math.min(layers.length, i + 1)
              : Math.max(0, i - 1);
      layers.splice(target, 0, layer);
      return { ...doc, layers };
    });
  },

  setBackground: (bg) => get().commit((doc) => ({ ...doc, background: bg })),

  save: async () => {
    const { doc, dirty } = get();
    if (!doc || !dirty) return;
    await db.projects.put({ ...doc, updatedAt: Date.now() });
    // only clear the flag if nothing changed while the write was in flight
    if (get().doc === doc) set({ dirty: false });
    // durable revision snapshot, throttled per project (in-memory undo is
    // separate and untouched). Fire-and-forget — never blocks the save.
    const now = Date.now();
    if (shouldSnapshot(lastSnapshotAt.get(doc.id), now)) {
      lastSnapshotAt.set(doc.id, now);
      void snapshotProject(doc, undefined, MAX_SNAPSHOTS);
    }
  },

  markSaved: () => set({ dirty: false }),
}));
