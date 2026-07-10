// Bundled open-license fonts (SIL OFL, self-hosted in public/fonts) plus a
// system stack. All are usable on canvas text layers.
export interface FontOption {
  family: string;
  label: string;
  weights: number[];
}

export const FONTS: FontOption[] = [
  { family: 'Inter', label: 'Inter — clean sans', weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Playfair Display', label: 'Playfair — serif display', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Space Grotesk', label: 'Space Grotesk — techy', weights: [300, 400, 500, 600, 700] },
  { family: 'Lora', label: 'Lora — book serif', weights: [400, 500, 600, 700] },
  { family: 'Caveat', label: 'Caveat — handwritten', weights: [400, 500, 600, 700] },
  { family: 'system-ui', label: 'System', weights: [300, 400, 500, 600, 700, 800] },
];

/** Ensure fonts are decoded before canvas text renders/export. */
export async function ensureFontsLoaded(): Promise<void> {
  const loads = FONTS.filter((f) => f.family !== 'system-ui').flatMap((f) => [
    document.fonts.load(`400 24px "${f.family}"`),
    document.fonts.load(`700 24px "${f.family}"`),
  ]);
  await Promise.allSettled(loads);
}
