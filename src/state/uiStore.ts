import { create } from 'zustand';

export type Screen = 'home' | 'library' | 'editor' | 'preview';

export type EditorSheet =
  | 'none'
  | 'add'
  | 'text'
  | 'background'
  | 'templates'
  | 'panels'
  | 'layers'
  | 'photoEdit'
  | 'export'
  | 'captions'
  | 'stickers'
  | 'gridPlan';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error' | 'success';
  /** sticky toasts don't auto-dismiss (e.g. "update available") */
  sticky?: boolean;
  /** tapping the toast runs this instead of dismissing */
  onAction?: () => void;
}

export interface ToastOptions {
  sticky?: boolean;
  onAction?: () => void;
}

interface UIState {
  screen: Screen;
  activeAlbumId: string | null;
  sheet: EditorSheet;
  toasts: Toast[];
  /** cover page shown until dismissed once (persisted) */
  welcomed: boolean;
  dismissWelcome: () => void;
  showWelcome: () => void;
  /** photo picker target: add layers vs fill a specific placeholder */
  pickerTarget: { kind: 'layer' } | { kind: 'fill'; layerId: string } | { kind: 'background' } | null;
  copiedStackPhotoId: string | null;

  go: (screen: Screen) => void;
  setAlbum: (id: string | null) => void;
  openSheet: (sheet: EditorSheet) => void;
  closeSheet: () => void;
  toast: (message: string, kind?: Toast['kind'], opts?: ToastOptions) => void;
  dismissToast: (id: number) => void;
  setPickerTarget: (t: UIState['pickerTarget']) => void;
  setCopiedStack: (photoId: string | null) => void;
}

let toastId = 0;

const WELCOME_KEY = 'montage-welcomed';

export const useUIStore = create<UIState>((set) => ({
  screen: 'home',
  activeAlbumId: null,
  sheet: 'none',
  toasts: [],
  welcomed:
    typeof localStorage !== 'undefined' && localStorage.getItem(WELCOME_KEY) === '1',
  dismissWelcome: () => {
    try {
      localStorage.setItem(WELCOME_KEY, '1');
    } catch {
      /* private mode */
    }
    set({ welcomed: true });
  },
  showWelcome: () => set({ welcomed: false }),
  pickerTarget: null,
  copiedStackPhotoId: null,

  go: (screen) => set({ screen, sheet: 'none' }),
  setAlbum: (id) => set({ activeAlbumId: id }),
  openSheet: (sheet) => set({ sheet }),
  closeSheet: () => set({ sheet: 'none', pickerTarget: null }),
  toast: (message, kind = 'info', opts) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, message, kind, ...opts }] }));
    if (!opts?.sticky) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, 3500);
    }
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setPickerTarget: (t) => set({ pickerTarget: t }),
  setCopiedStack: (photoId) => set({ copiedStackPhotoId: photoId }),
}));
