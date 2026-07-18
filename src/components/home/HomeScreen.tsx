import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import gsap from 'gsap';
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
import { useEntrance, useTilt, prefersReducedMotion } from '../../lib/fx/useFx';

/** the title-sequence lines for the making-of overlay */
const STAGE_LINE: Record<MontageProgress['stage'], string> = {
  importing: 'Reading your photos',
  scoring: 'Choosing the keepers',
  stitching: 'Cutting your story',
};

/** human time: the reader thinks "2h ago", not in ISO strings */
function timeAgo(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 172800) return 'yesterday';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function HomeScreen() {
  const go = useUIStore((s) => s.go);
  const toast = useUIStore((s) => s.toast);
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), []);
  const [showNew, setShowNew] = useState(false);
  const [montaging, setMontaging] = useState<MontageProgress | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const montageRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLButtonElement>(null);

  useEntrance(rootRef, []);
  useTilt(heroRef);

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
    toast('Copy made', 'success');
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
      toast(`Restored "${doc.name}"`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'That file could not be restored', 'error');
    }
  };

  return (
    <div
      ref={rootRef}
      className="relative mx-auto flex h-full max-w-3xl flex-col overflow-y-auto px-5 pt-[max(env(safe-area-inset-top),1rem)]"
      onClick={() => menuFor && setMenuFor(null)}
    >
      <div className="film-grain" aria-hidden />

      {/* wordmark — the app speaks in its films' own voice */}
      <header data-rise className="pb-5 pt-6" style={{ opacity: 0 }}>
        <h1 className="font-serif text-[2.1rem] font-bold leading-none tracking-tight text-ink-50">
          Montage
          <span className="ml-2 bg-clip-text italic text-transparent" style={{ backgroundImage: 'var(--beam)' }}>
            Studio
          </span>
        </h1>
        <p className="mt-2 text-[13px] text-ink-400">
          Films from your photos — made on your device, never uploaded ·{' '}
          <button
            className="underline decoration-dotted underline-offset-2"
            onClick={() => useUIStore.getState().showWelcome()}
          >
            about
          </button>
        </p>
      </header>

      {/* the hero: a projector switched on in a dark room */}
      <button
        ref={heroRef}
        data-rise
        className="sheen group relative mb-2 w-full overflow-hidden rounded-3xl border border-ink-700/60 bg-ink-900 p-6 text-left shadow-lg transition-transform active:scale-[0.99]"
        style={{ opacity: 0 }}
        onClick={() => montageRef.current?.click()}
      >
        {/* the beam */}
        <div
          aria-hidden
          className="beam-drift pointer-events-none absolute -inset-14"
          style={{ backgroundImage: 'var(--beam-soft)', filter: 'blur(28px)' }}
        />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/70 via-transparent to-transparent" />
        <div className="relative">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-accent-300/90">
            Auto Montage
          </div>
          <div className="mt-2.5 max-w-[17ch] font-serif text-[1.9rem] font-bold leading-[1.12] text-ink-50">
            Turn a photo dump into a short film
          </div>
          <div className="mt-2 text-sm leading-relaxed text-ink-300">
            Drop in your camera roll — the best shots are picked, framed and cut to music for you.
          </div>
          <div className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-ink-950 shadow-lg" style={{ backgroundImage: 'linear-gradient(to bottom, var(--color-accent-300), var(--color-accent-500))' }}>
            <Icon name="sparkles" size={18} />
            Make my montage
          </div>
        </div>
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
      <div data-rise className="mb-6 pt-1 text-center" style={{ opacity: 0 }}>
        <button
          className="min-h-9 text-xs text-ink-400 underline decoration-dotted underline-offset-2"
          onClick={() => void runDemo()}
        >
          No photos handy? Try a demo trip →
        </button>
      </div>

      {/* your work */}
      <div data-rise className="min-h-0 flex-1 pb-4" style={{ opacity: 0 }}>
        <div className="mb-3 flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-ink-500">
            Your work
          </span>
          <span className="hairline h-px flex-1 border-t" />
        </div>

        {projects?.length === 0 && (
          <div className="card p-8 text-center text-sm leading-relaxed text-ink-400">
            Nothing here yet — your montages will live on this shelf.
            <br />
            Start above, or try the demo trip.
          </div>
        )}

        <div className="space-y-2 pb-6">
          {projects && projects.length > 0 && (
            <button
              className="card group w-full overflow-hidden p-4 text-left transition-transform active:scale-[0.99]"
              onClick={() => openProject(projects[0])}
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent-400">
                Continue where you left off
              </div>
              <div className="mt-1 truncate font-serif text-xl font-bold text-ink-50">
                {projects[0].name}
              </div>
              <div className="mt-0.5 text-xs text-ink-400">
                {projects[0].mode === 'grid'
                  ? `Profile grid · 3×${projects[0].panelCount}`
                  : `${projects[0].panelCount} panels · ${projects[0].aspect}`}{' '}
                · {timeAgo(projects[0].updatedAt)}
              </div>
            </button>
          )}

          {projects?.slice(projects.length > 0 ? 1 : 0).map((p) => (
            <div key={p.id} className="surface relative flex items-center rounded-2xl">
              <button className="min-w-0 flex-1 p-4 text-left" onClick={() => openProject(p)}>
                <div className="truncate text-sm font-semibold text-ink-100">{p.name}</div>
                <div className="mt-0.5 text-xs text-ink-500">
                  {p.mode === 'grid'
                    ? `Profile grid · 3×${p.panelCount}`
                    : `${p.panelCount} panels · ${p.aspect}`}{' '}
                  · {timeAgo(p.updatedAt)}
                </div>
              </button>
              <button
                className="icon-btn mr-1"
                aria-label="More options"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuFor(menuFor === p.id ? null : p.id);
                }}
              >
                <Icon name="more" size={20} />
              </button>
              {menuFor === p.id && (
                <div
                  className="card absolute right-2 top-14 z-20 w-44 overflow-hidden p-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MenuItem
                    icon="copy"
                    label="Make a copy"
                    onClick={() => {
                      setMenuFor(null);
                      void duplicate(p);
                    }}
                  />
                  <MenuItem
                    icon="download"
                    label="Save backup file"
                    onClick={() => {
                      setMenuFor(null);
                      exportJson(p);
                    }}
                  />
                  <MenuItem
                    icon="trash"
                    label="Delete"
                    danger
                    onClick={() => {
                      setMenuFor(null);
                      void remove(p);
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* quiet utility row — the technical stuff, out of the way */}
        <div className="flex items-center gap-2 pb-8">
          <button className="btn-soft flex-1" onClick={() => go('library')}>
            <Icon name="image" size={18} />
            Photo Library
          </button>
          <button className="btn-soft flex-1" onClick={() => setShowNew(true)}>
            <Icon name="plus" size={18} />
            New project
          </button>
          <button
            className="icon-btn"
            title="Restore a backup file"
            aria-label="Restore a backup file"
            onClick={() => importRef.current?.click()}
          >
            <Icon name="share" size={20} className="rotate-180" />
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
      </div>

      {showNew && <NewProjectDialog onClose={() => setShowNew(false)} onCreate={openProject} />}
      {montaging && <TitleSequenceOverlay progress={montaging} />}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-ink-800 ${
        danger ? 'text-red-400' : 'text-ink-100'
      }`}
      onClick={onClick}
    >
      <Icon name={icon} size={17} />
      {label}
    </button>
  );
}

/**
 * The making-of moment as a title sequence: black room, one serif line that
 * crossfades per stage, a thin beam of light filling below it.
 */
function TitleSequenceOverlay({ progress }: { progress: MontageProgress }) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const lineRef = useRef<HTMLDivElement>(null);
  const lastStage = useRef<MontageProgress['stage']>(progress.stage);

  // crossfade the stage line when the stage changes
  useEffect(() => {
    if (lastStage.current === progress.stage) return;
    lastStage.current = progress.stage;
    if (lineRef.current && !prefersReducedMotion()) {
      gsap.fromTo(
        lineRef.current,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' },
      );
    }
  }, [progress.stage]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink-950">
      <div className="film-grain" aria-hidden />
      {/* faint beam from above */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[70%] w-[130%] -translate-x-1/2 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 45% 60% at 50% 0%, rgb(248 192 106 / 0.16), transparent 70%)',
        }}
      />
      <div className="relative w-full max-w-sm px-10 text-center">
        <div className="text-[10px] font-semibold uppercase tracking-[0.4em] text-ink-500">
          Making your montage
        </div>
        <div ref={lineRef} className="mt-4 font-serif text-3xl font-bold italic leading-snug text-ink-50">
          {STAGE_LINE[progress.stage]}…
        </div>
        <div className="mx-auto mt-8 h-px w-full overflow-hidden rounded-full bg-ink-800">
          <div
            className="h-full transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(4, pct)}%`, backgroundImage: 'var(--beam)' }}
          />
        </div>
        <div className="mt-3 text-xs tabular-nums text-ink-500">
          {progress.total > 1 ? `${progress.done} of ${progress.total}` : `${pct}%`}
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
      <div className="fixed inset-0 z-30 bg-black/50" onClick={onClose} />
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
                        ? 'border-accent-500 bg-accent-500/10 text-accent-300'
                        : 'border-ink-700'
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
                      ? 'border-accent-500 bg-accent-500/10 text-accent-300'
                      : 'border-ink-700'
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
            <span className="mb-1 flex justify-between text-ink-400">
              <span>{mode === 'grid' ? 'Rows' : 'Panels'}</span>
              <b className="text-ink-100">{panels}</b>
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
        active ? 'border-accent-500 bg-accent-500/10' : 'border-ink-700 hover:bg-ink-800'
      }`}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-ink-400">{subtitle}</div>
    </button>
  );
}
