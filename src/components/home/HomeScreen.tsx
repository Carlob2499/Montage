import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteProjectSnapshots, uid } from '../../db/db';
import { useProjectStore } from '../../state/projectStore';
import { useUIStore } from '../../state/uiStore';
import { confirmAction } from '../../state/dialogStore';
import { downloadBlob, slug } from '../../lib/exporter';
import { normalizeProjectDoc } from '../../lib/projectSchema';
import type { ProjectDoc, ProjectMode } from '../../types';
import { ASPECT_PRESETS } from '../../types';
import Icon from '../shared/Icon';
import { createMontageFromFiles } from '../../lib/curation/autoMontageFlow';
import type { MontageProgress } from '../../lib/curation/autoMontageFlow';
import { generateSampleFiles } from '../../lib/demo/sampleTrip';
import { useMontageStore } from '../../state/montageStore';

const STAGE_LABEL: Record<MontageProgress['stage'], string> = {
  importing: 'Importing your photos',
  scoring: 'Picking the best shots',
  stitching: 'Stitching your montage',
};

export default function HomeScreen() {
  const go = useUIStore((s) => s.go);
  const toast = useUIStore((s) => s.toast);
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), []);
  const [showNew, setShowNew] = useState(false);
  const [montaging, setMontaging] = useState<MontageProgress | null>(null);
  const montageRef = useRef<HTMLInputElement>(null);

  const runAutoMontage = async (files: File[]) => {
    setMontaging({ stage: 'importing', done: 0, total: files.length });
    try {
      const res = await createMontageFromFiles(files, setMontaging);
      useMontageStore.getState().setRecipe({
        docId: res.doc.id,
        album: res.album,
        picks: res.picks,
        vibe: res.vibe,
        shuffles: 0,
      });
      useProjectStore.getState().loadProject(res.doc);
      go('preview');
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : 'Could not create montage', 'error');
    } finally {
      setMontaging(null);
    }
  };
  const runDemo = async () => {
    setMontaging({ stage: 'importing', done: 0, total: 6 });
    try {
      const files = await generateSampleFiles();
      await runAutoMontage(files);
    } catch (err) {
      console.error(err);
      toast('Could not start the demo', 'error');
      setMontaging(null);
    }
  };
  const importRef = useRef<HTMLInputElement>(null);

  const openProject = (doc: ProjectDoc) => {
    useProjectStore.getState().loadProject(doc);
    go('editor');
  };

  const duplicate = async (doc: ProjectDoc) => {
    const copy: ProjectDoc = {
      ...structuredClone(doc),
      id: uid(),
      name: `${doc.name} copy`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.projects.put(copy);
    toast('Project duplicated', 'success');
  };

  const remove = async (doc: ProjectDoc) => {
    const ok = await confirmAction({
      title: `Delete "${doc.name}"?`,
      message: 'The project is removed. Photos stay in your library.',
      destructive: true,
    });
    if (!ok) return;
    await db.projects.delete(doc.id);
    await deleteProjectSnapshots(doc.id);
  };

  const exportJson = (doc: ProjectDoc) => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${slug(doc.name)}-project.json`);
  };

  const importJson = async (file: File) => {
    try {
      const doc = normalizeProjectDoc(JSON.parse(await file.text()));
      doc.id = uid(); // avoid clobbering an existing project
      doc.updatedAt = Date.now();
      await db.projects.put(doc);
      toast(`Imported "${doc.name}"`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed', 'error');
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-4 pt-[max(env(safe-area-inset-top),1rem)]">
      <header className="flex items-center justify-between py-4">
        <div>
          <h1 className="font-['Space_Grotesk'] text-2xl font-bold tracking-tight">
            Montage{' '}
            <span className="bg-gradient-to-r from-amber-400 via-pink-400 to-violet-500 bg-clip-text text-transparent">
              Studio
            </span>
          </h1>
          <p className="text-sm text-ink-400">
            Seamless carousels, on your device only ·{' '}
            <button
              className="underline decoration-dotted underline-offset-2"
              onClick={() => useUIStore.getState().showWelcome()}
            >
              about
            </button>
          </p>
        </div>
        <button className="btn-soft" onClick={() => go('library')}>
          Photo Library
        </button>
      </header>

      {/* one-tap flagship: dump photos → finished curated montage */}
      <button
        className="group relative mb-3 flex w-full items-center gap-3 overflow-hidden rounded-2xl p-4 text-left text-white shadow-lg transition-transform active:scale-[0.99]"
        style={{ backgroundImage: 'linear-gradient(120deg, #7c5cff, #a689ff 45%, #f472b6)' }}
        onClick={() => montageRef.current?.click()}
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/20">
          <Icon name="sparkles" size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-bold leading-tight">Auto Montage</span>
          <span className="block text-xs text-white/85">
            Dump your photos — I’ll pick the best & stitch them
          </span>
        </span>
        <Icon name="chevron-right" size={20} className="text-white/70" />
      </button>
      <input
        ref={montageRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void runAutoMontage(files);
        }}
      />
      <div className="mb-3 -mt-1 text-center">
        <button
          className="text-xs text-ink-400 underline decoration-dotted underline-offset-2"
          onClick={() => void runDemo()}
        >
          No photos handy? Try a demo trip →
        </button>
      </div>

      <div className="flex gap-2 pb-4">
        <button className="btn-soft flex-1" onClick={() => setShowNew(true)}>
          <Icon name="plus" size={18} />
          New project
        </button>
        <button className="btn-soft" onClick={() => importRef.current?.click()}>
          Import JSON
        </button>
        <input
          ref={importRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importJson(f);
            e.target.value = '';
          }}
        />
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-8">
        {projects?.length === 0 && (
          <div className="surface rounded-2xl p-8 text-center text-ink-400">
            No projects yet. Start with a new project, then pull photos in from your library.
          </div>
        )}
        {projects && projects.length > 0 && (
          <button
            className="w-full rounded-2xl bg-gradient-to-r from-accent-500 to-accent-600 p-4 text-left text-white shadow-lg transition-transform active:scale-[0.99]"
            onClick={() => openProject(projects[0])}
          >
            <div className="text-xs font-medium uppercase tracking-wide text-white/70">
              Continue where you left off
            </div>
            <div className="truncate text-lg font-bold">{projects[0].name}</div>
            <div className="text-xs text-white/70">
              {projects[0].mode === 'grid'
                ? `Profile grid · 3×${projects[0].panelCount}`
                : `Carousel · ${projects[0].panelCount} × ${projects[0].aspect}`}{' '}
              · {new Date(projects[0].updatedAt).toLocaleString()}
            </div>
          </button>
        )}
        {projects?.map((p) => (
          <div key={p.id} className="surface flex items-center gap-3 rounded-2xl p-4">
            <button className="min-w-0 flex-1 text-left" onClick={() => openProject(p)}>
              <div className="truncate font-semibold">{p.name}</div>
              <div className="text-xs text-ink-400">
                {p.mode === 'grid'
                  ? `Profile grid · 3×${p.panelCount}`
                  : `Carousel · ${p.panelCount} × ${p.aspect}`}{' '}
                · {new Date(p.updatedAt).toLocaleString()}
              </div>
            </button>
            <button className="icon-btn" title="Export JSON backup" aria-label="Export JSON backup" onClick={() => exportJson(p)}>
              <Icon name="download" size={20} />
            </button>
            <button className="icon-btn" title="Duplicate" aria-label="Duplicate" onClick={() => void duplicate(p)}>
              <Icon name="copy" size={20} />
            </button>
            <button className="icon-btn text-red-500" title="Delete" aria-label="Delete" onClick={() => void remove(p)}>
              <Icon name="trash" size={20} />
            </button>
          </div>
        ))}
      </div>

      {showNew && <NewProjectDialog onClose={() => setShowNew(false)} onCreate={openProject} />}
      {montaging && <MontageProgressOverlay progress={montaging} />}
    </div>
  );
}

function MontageProgressOverlay({ progress }: { progress: MontageProgress }) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="card w-[300px] p-6 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl text-white" style={{ backgroundImage: 'linear-gradient(120deg, #7c5cff, #f472b6)' }}>
          <Icon name="sparkles" size={28} />
        </div>
        <div className="font-display text-base font-bold">Creating your montage…</div>
        <div className="mt-1 text-xs text-ink-400">
          {STAGE_LABEL[progress.stage]}
          {progress.total > 1 ? ` · ${progress.done}/${progress.total}` : ''}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-700">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundImage: 'linear-gradient(90deg, #7c5cff, #f472b6)' }}
          />
        </div>
      </div>
    </div>
  );
}

const clampDim = (n: number): number =>
  Number.isFinite(n) ? Math.min(4096, Math.max(200, Math.round(n))) : 1080;

function NewProjectDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (doc: ProjectDoc) => void;
}) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<ProjectMode>('carousel');
  const [aspect, setAspect] = useState<string>('4:5');
  const [custom, setCustom] = useState(false);
  const [customW, setCustomW] = useState(1080);
  const [customH, setCustomH] = useState(1350);
  const [panels, setPanels] = useState(4);

  const create = () => {
    const preset = ASPECT_PRESETS.find((p) => p.aspect === aspect);
    const w = custom ? clampDim(customW) : (preset?.w ?? 1080);
    const h = custom ? clampDim(customH) : (preset?.h ?? 1350);
    const label = custom ? `${w}×${h}` : aspect;
    const doc = useProjectStore
      .getState()
      .newProject(name.trim() || 'Untitled montage', mode, label, panels, w, h);
    onCreate(doc);
  };

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30" onClick={onClose} />
      <div className="sheet z-40 md:inset-auto md:left-1/2 md:top-1/2 md:w-[420px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border">
        <div className="space-y-4 p-5">
          <h3 className="text-lg font-semibold">New project</h3>
          <input
            className="input-base"
            placeholder="Project name (e.g. Lisbon '26)"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <ModeButton
              active={mode === 'carousel'}
              title="Carousel"
              subtitle="Panels sliced from one wide canvas"
              onClick={() => setMode('carousel')}
            />
            <ModeButton
              active={mode === 'grid'}
              title="Profile grid"
              subtitle="3×N tiles for your profile page"
              onClick={() => setMode('grid')}
            />
          </div>
          {mode === 'carousel' && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {ASPECT_PRESETS.map((p) => (
                  <button
                    key={p.aspect}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                      !custom && aspect === p.aspect
                        ? 'border-accent-500 bg-accent-500/10 text-accent-600 dark:text-accent-300'
                        : 'border-ink-200 dark:border-ink-700'
                    }`}
                    onClick={() => {
                      setCustom(false);
                      setAspect(p.aspect);
                    }}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                    custom
                      ? 'border-accent-500 bg-accent-500/10 text-accent-600 dark:text-accent-300'
                      : 'border-ink-200 dark:border-ink-700'
                  }`}
                  onClick={() => setCustom(true)}
                >
                  Custom
                </button>
              </div>
              {custom && (
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="number"
                    className="input-base w-24"
                    min={200}
                    max={4096}
                    value={customW}
                    onChange={(e) => setCustomW(Number(e.target.value))}
                    aria-label="Width"
                  />
                  <span className="text-ink-400">×</span>
                  <input
                    type="number"
                    className="input-base w-24"
                    min={200}
                    max={4096}
                    value={customH}
                    onChange={(e) => setCustomH(Number(e.target.value))}
                    aria-label="Height"
                  />
                  <span className="text-xs text-ink-400">px per panel</span>
                </div>
              )}
            </div>
          )}
          <label className="block text-sm">
            <span className="mb-1 flex justify-between text-ink-500">
              <span>{mode === 'grid' ? 'Rows' : 'Panels'}</span>
              <b className="text-ink-900 dark:text-ink-100">{panels}</b>
            </span>
            <input
              type="range"
              min={1}
              max={mode === 'grid' ? 8 : 20}
              value={panels}
              onChange={(e) => setPanels(Number(e.target.value))}
            />
          </label>
          <div className="flex gap-2 pt-1">
            <button className="btn-soft flex-1" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary flex-1" onClick={create}>
              Create
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ModeButton({
  active,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition-colors ${
        active
          ? 'border-accent-500 bg-accent-500/10'
          : 'border-ink-200 dark:border-ink-700 hover:bg-ink-100 dark:hover:bg-ink-800'
      }`}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-ink-400">{subtitle}</div>
    </button>
  );
}
