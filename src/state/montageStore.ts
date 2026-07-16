import { create } from 'zustand';
import type { AlbumRecord, PhotoRecord, VibeLabel } from '../types';

/** everything needed to re-generate (shuffle) an auto montage without re-importing */
export interface MontageRecipe {
  /** id of the montage doc this recipe currently backs (guards against a stale
   *  recipe leaking onto an unrelated project opened later in the session) */
  docId: string;
  album: AlbumRecord;
  picks: PhotoRecord[];
  vibe: VibeLabel;
  /** how many times the user has shuffled (drives seed/vibe variety) */
  shuffles: number;
}

interface MontageState {
  recipe: MontageRecipe | null;
  setRecipe: (r: MontageRecipe | null) => void;
}

export const useMontageStore = create<MontageState>((set) => ({
  recipe: null,
  setRecipe: (recipe) => set({ recipe }),
}));
