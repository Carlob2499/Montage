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
}

interface UIState {
  screen: Screen;
  activeAlbumId: string | null;
  sheet: EditorSheet;
  toasts: Toast[];
  /** photo picker target: add layers vs fill a specific placeholder */
  pickerTarget: { kind: 'layer' } | { kind: 'fill'; layerId: string } | { kind: 'background' } | null;
  copiedStackPhotoId: string | null;

  go: (screen: Screen) => void;
  setAlbum: (id: string | null) => void;
  openSheet: (sheet: EditorSheet) => void;
  closeSheet: () => void;
  toast: (message: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  setPickerTarget: (t: UIState['pickerTarget']) => void;
  setCopiedStack: (photoId: string | null) => void;
}

let toastId = 0;

export const useUIStore = create<UIState>((set) => ({
  screen: 'home',
  activeAlbumId: null,
  sheet: 'none',
  toasts: [],
  pickerTarget: null,
  copiedStackPhotoId: null,

  go: (screen) => set({ screen, sheet: 'none' }),
  setAlbum: (id) => set({ activeAlbumId: id }),
  openSheet: (sheet) => set({ sheet }),
  closeSheet: () => set({ sheet: 'none', pickerTarget: null }),
  toast: (message, kind = 'info') => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setPickerTarget: (t) => set({ pickerTarget: t }),
  setCopiedStack: (photoId) => set({ copiedStackPhotoId: photoId }),
}));
