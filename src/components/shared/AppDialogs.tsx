import { useEffect, useRef, useState } from 'react';
import { useDialogStore } from '../../state/dialogStore';

/**
 * Single host for the promise-based dialog system. Renders the front of the
 * queue as a centered in-app modal (reusing NewProjectDialog's .sheet
 * styling), so album creation / rename / confirms work in installed iOS
 * standalone PWAs where native prompt()/confirm() are inert.
 */
export default function AppDialogs() {
  const req = useDialogStore((s) => s.queue[0]);
  const resolve = useDialogStore((s) => s._resolve);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // reseed the input whenever a new prompt reaches the front of the queue
  useEffect(() => {
    if (req?.kind === 'prompt') {
      setValue(req.defaultValue ?? '');
      // focus after paint
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [req?.id, req?.kind, req?.defaultValue]);

  if (!req) return null;

  const cancel = () => resolve(req.id, req.kind === 'prompt' ? null : false);
  const submitPrompt = () => resolve(req.id, value);
  const confirm = () => resolve(req.id, true);

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/40" onClick={cancel} />
      <div className="sheet z-[71] md:inset-auto md:left-1/2 md:top-1/2 md:w-[420px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border">
        <div className="space-y-4 p-5">
          <div>
            <h3 className="text-lg font-semibold">{req.title}</h3>
            {req.message && <p className="mt-1 text-sm text-ink-500">{req.message}</p>}
          </div>

          {req.kind === 'prompt' && (
            <input
              ref={inputRef}
              data-testid="dialog-input"
              className="input-base"
              placeholder={req.placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitPrompt();
                if (e.key === 'Escape') cancel();
              }}
            />
          )}

          <div className="flex gap-2 pt-1">
            <button data-testid="dialog-cancel" className="btn-soft flex-1" onClick={cancel}>
              {req.cancelLabel ?? 'Cancel'}
            </button>
            <button
              data-testid="dialog-confirm"
              className={`flex-1 ${req.destructive ? 'btn bg-red-600 text-white hover:bg-red-700 active:bg-red-700' : 'btn-primary'}`}
              onClick={req.kind === 'prompt' ? submitPrompt : confirm}
            >
              {req.confirmLabel ?? (req.destructive ? 'Delete' : 'OK')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
