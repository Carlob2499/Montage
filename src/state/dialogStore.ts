import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Promise-based, pure-React dialog system. Replaces window.prompt/confirm,
// which iOS DISABLES in installed standalone PWAs (they return immediately
// with no UI). Any module — components, canvasActions, lib — can `await`
// promptText()/confirmAction() via getState(), no hooks required.
// ---------------------------------------------------------------------------

export interface DialogRequest {
  id: number;
  kind: 'prompt' | 'confirm';
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** resolves the awaiting caller; string|null for prompt, boolean for confirm */
  resolve: (value: string | null | boolean) => void;
}

interface DialogState {
  queue: DialogRequest[];
  _open: (req: Omit<DialogRequest, 'id'>) => void;
  _resolve: (id: number, value: string | null | boolean) => void;
}

let dialogId = 0;

export const useDialogStore = create<DialogState>((set, get) => ({
  queue: [],
  _open: (req) => {
    const id = ++dialogId;
    set((s) => ({ queue: [...s.queue, { ...req, id }] }));
  },
  _resolve: (id, value) => {
    const req = get().queue.find((r) => r.id === id);
    if (req) req.resolve(value);
    set((s) => ({ queue: s.queue.filter((r) => r.id !== id) }));
  },
}));

export interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

/** In-app text prompt. Resolves the entered string, or null on cancel. */
export function promptText(opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    useDialogStore.getState()._open({
      kind: 'prompt',
      resolve: resolve as (v: string | null | boolean) => void,
      ...opts,
    });
  });
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/** In-app confirmation. Resolves true (confirmed) or false (cancelled). */
export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogStore.getState()._open({
      kind: 'confirm',
      resolve: resolve as (v: string | null | boolean) => void,
      ...opts,
    });
  });
}
