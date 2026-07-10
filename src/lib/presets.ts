// ---------------------------------------------------------------------------
// Original named filter presets. Each is just an adjustment stack — nothing
// baked in, fully reversible, and they compose with manual tweaks.
// ---------------------------------------------------------------------------

import { NEUTRAL_ADJUSTMENTS } from '../types';
import type { Adjustments } from '../types';

export interface FilterPreset {
  id: string;
  name: string;
  description: string;
  adjustments: Adjustments;
}

const preset = (
  id: string,
  name: string,
  description: string,
  partial: Partial<Adjustments>,
): FilterPreset => ({
  id,
  name,
  description,
  adjustments: { ...NEUTRAL_ADJUSTMENTS, ...partial },
});

export const FILTER_PRESETS: FilterPreset[] = [
  preset('none', 'Original', 'No adjustments', {}),
  preset('driftwood', 'Driftwood', 'Warm, faded beach light', {
    exposure: 8,
    contrast: -10,
    highlights: -15,
    temperature: 25,
    saturation: -12,
    vignette: 10,
  }),
  preset('glacier', 'Glacier', 'Cool crisp blues', {
    temperature: -30,
    tint: -5,
    contrast: 12,
    vibrance: 15,
    sharpness: 15,
  }),
  preset('lantern', 'Lantern', 'Golden-hour glow', {
    exposure: 10,
    temperature: 35,
    tint: 8,
    shadows: 15,
    highlights: -20,
    vibrance: 10,
  }),
  preset('gravel', 'Gravel', 'Punchy urban mono', {
    saturation: -100,
    contrast: 30,
    shadows: -10,
    sharpness: 25,
    vignette: 20,
  }),
  preset('linen', 'Linen', 'Soft matte editorial', {
    contrast: -18,
    shadows: 25,
    highlights: -10,
    saturation: -8,
    exposure: 5,
  }),
  preset('juniper', 'Juniper', 'Deep forest greens', {
    temperature: -10,
    tint: -18,
    contrast: 15,
    vibrance: 20,
    shadows: -8,
    vignette: 15,
  }),
  preset('ember', 'Ember', 'High-contrast warm dusk', {
    temperature: 20,
    contrast: 25,
    shadows: -15,
    vibrance: 18,
    vignette: 25,
  }),
  preset('paperlight', 'Paperlight', 'Bright airy minimal', {
    exposure: 18,
    highlights: -12,
    shadows: 20,
    contrast: -8,
    saturation: -5,
  }),
  preset('static', 'Static', 'Silvery low-key mono', {
    saturation: -100,
    contrast: -5,
    exposure: 6,
    shadows: 18,
    highlights: -18,
  }),
  preset('marmalade', 'Marmalade', 'Vivid citrus pop', {
    vibrance: 35,
    saturation: 10,
    temperature: 15,
    contrast: 10,
    sharpness: 10,
  }),
  preset('nightswim', 'Nightswim', 'Moody blue shadows', {
    temperature: -22,
    tint: 10,
    exposure: -8,
    contrast: 18,
    shadows: -12,
    vignette: 30,
  }),
  preset('fernline', 'Fernline', 'Muted overcast trail', {
    saturation: -20,
    vibrance: 12,
    temperature: -6,
    contrast: 6,
    shadows: 10,
  }),
];

export function getPreset(id: string): FilterPreset | undefined {
  return FILTER_PRESETS.find((p) => p.id === id);
}
