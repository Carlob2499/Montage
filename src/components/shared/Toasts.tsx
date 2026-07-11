import { useUIStore } from '../../state/uiStore';

export default function Toasts() {
  const toasts = useUIStore((s) => s.toasts);
  const dismiss = useUIStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => {
            if (t.onAction) t.onAction();
            else dismiss(t.id);
          }}
          className={`pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
            t.kind === 'error'
              ? 'bg-red-600'
              : t.kind === 'success'
                ? 'bg-emerald-600'
                : 'bg-ink-800 dark:bg-ink-700'
          }`}
        >
          {t.message}
          {t.onAction && <span className="ml-2 underline underline-offset-2">↻</span>}
        </button>
      ))}
    </div>
  );
}
