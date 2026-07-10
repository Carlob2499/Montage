// ---------------------------------------------------------------------------
// Core domain types for Montage Studio
// ---------------------------------------------------------------------------

export type PanelAspect = '4:5' | '1:1' | '9:16';

export const PANEL_WIDTH = 1080;

export const PANEL_HEIGHTS: Record<PanelAspect, number> = {
  '4:5': 1350,
  '1:1': 1080,
  '9:16': 1920,
};

// --- Photo library ---------------------------------------------------------

export interface PhotoRecord {
  id: string;
  albumId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  /** EXIF DateTimeOriginal (ms epoch), if present */
  dateTaken?: number;
  dateAdded: number;
  /** EXIF orientation 1-8; thumbnails/render are pre-rotated so this is informational */
  orientation?: number;
  gps?: { lat: number; lng: number };
  tags: string[];
  /** manual sort position within album */
  order: number;
  kind: 'image' | 'video';
  duplicateOf?: string;
}

export interface AlbumRecord {
  id: string;
  name: string;
  createdAt: number;
  sortMode: SortMode;
}

export type SortMode = 'dateTaken' | 'fileName' | 'dateAdded' | 'manual';

// --- Non-destructive edits --------------------------------------------------

export interface Adjustments {
  /** -100..100, ±100 ≈ ±2 stops */
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  saturation: number;
  vibrance: number;
  /** blue ← 0 → amber */
  temperature: number;
  /** green ← 0 → magenta */
  tint: number;
  /** 0..100 */
  sharpness: number;
  /** 0..100 */
  vignette: number;
}

export const NEUTRAL_ADJUSTMENTS: Adjustments = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  saturation: 0,
  vibrance: 0,
  temperature: 0,
  tint: 0,
  sharpness: 0,
  vignette: 0,
};

export interface CropState {
  /** normalized source rect, 0..1 */
  x: number;
  y: number;
  width: number;
  height: number;
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}

export interface EditStack {
  adjustments: Adjustments;
  crop?: CropState;
  /** id of the named preset this stack started from, for UI display */
  presetId?: string;
}

// --- Canvas layers -----------------------------------------------------------

interface LayerBase {
  id: string;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  locked?: boolean;
  name?: string;
}

export interface PhotoLayer extends LayerBase {
  type: 'photo';
  /** empty string = unfilled template placeholder */
  photoId: string;
  width: number;
  height: number;
  cornerRadius: number;
  /** zoom of the image inside its frame, relative to cover-fit (>= 1) */
  imgScale: number;
  /** pan inside frame, -1..1 of the free travel */
  imgOffsetX: number;
  imgOffsetY: number;
  /** mark as key subject for seam-safety warnings */
  isSubject?: boolean;
}

export interface TextLayer extends LayerBase {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  letterSpacing: number;
  lineHeight: number;
  fill: string;
  align: 'left' | 'center' | 'right';
  width?: number;
}

export interface StickerLayer extends LayerBase {
  type: 'sticker';
  stickerId: string;
  width: number;
  height: number;
}

export type Layer = PhotoLayer | TextLayer | StickerLayer;

// --- Background ---------------------------------------------------------------

export type Background =
  | { kind: 'solid'; color: string }
  | { kind: 'linear'; from: string; to: string; angle: number }
  | { kind: 'radial'; from: string; to: string }
  | { kind: 'blurPhoto'; photoId: string; blur: number; dim: number };

// --- Project -------------------------------------------------------------------

export type ProjectMode = 'carousel' | 'grid';

export interface ProjectDoc {
  id: string;
  name: string;
  /** carousel = horizontal panels; grid = 3×N profile-grid planner */
  mode: ProjectMode;
  aspect: PanelAspect;
  /** carousel: number of panels; grid: number of rows */
  panelCount: number;
  background: Background;
  layers: Layer[];
  /** per-panel captions, exported as text file */
  captions: string[];
  gutter: number;
  margin: number;
  templateId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StickerRecord {
  id: string;
  name: string;
  dateAdded: number;
}

// --- Templates -------------------------------------------------------------------

export type TemplateCategory =
  | 'travel'
  | 'event'
  | 'editorial'
  | 'minimal'
  | 'film-strip'
  | 'before-after';

export interface TemplateCell {
  /** fraction of full canvas width, 0..1 */
  x: number;
  y: number;
  w: number;
  h: number;
  /** corner radius in px at export scale */
  r?: number;
}

export interface TemplateText {
  x: number;
  y: number;
  text: string;
  /** px at export scale */
  size: number;
  weight?: number;
  align?: 'left' | 'center' | 'right';
  color?: string;
  letterSpacing?: number;
  width?: number;
}

export interface TemplateDef {
  id: string;
  name: string;
  category: TemplateCategory;
  /** panel count the layout was designed for */
  panels: number;
  aspect: PanelAspect | 'any';
  background?: Background;
  cells: TemplateCell[];
  texts?: TemplateText[];
}
