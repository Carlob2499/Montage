import type { ReactNode } from 'react';

/**
 * Mobile-first bottom sheet; on ≥md screens it becomes a floating right panel.
 */
export default function Sheet({
  title,
  onClose,
  children,
  tall,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  tall?: boolean;
}) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20 md:bg-transparent" onClick={onClose} />
      <div
        className={`sheet md:inset-x-auto md:right-4 md:bottom-4 md:top-20 md:w-[380px] md:rounded-2xl md:border ${
          tall ? 'max-h-[85dvh]' : 'max-h-[60dvh]'
        } md:max-h-none flex flex-col`}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="mx-auto h-1 w-10 rounded-full bg-ink-300 dark:bg-ink-600 md:hidden absolute left-1/2 -translate-x-1/2 top-2" />
          <h3 className="text-base font-semibold">{title}</h3>
          <button className="btn-ghost -mr-2 px-2.5" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </>
  );
}
