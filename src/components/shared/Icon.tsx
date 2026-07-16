// ---------------------------------------------------------------------------
// One cohesive line-icon set (Lucide-style, 24×24, currentColor stroke) so the
// UI stops relying on emoji — which render differently on every device and
// read as unprofessional. Add new glyphs to PATHS as needed.
// ---------------------------------------------------------------------------

import type { ReactElement } from 'react';

export type IconName =
  | 'image'
  | 'text'
  | 'layout'
  | 'palette'
  | 'panels'
  | 'layers'
  | 'clock'
  | 'star'
  | 'heart'
  | 'pin'
  | 'play'
  | 'pause'
  | 'undo'
  | 'redo'
  | 'close'
  | 'plus'
  | 'chevron-left'
  | 'chevron-right'
  | 'sparkles'
  | 'share'
  | 'download'
  | 'trash'
  | 'copy'
  | 'wand'
  | 'sliders'
  | 'grid'
  | 'eye'
  | 'music'
  | 'more';

/** each entry is the inner SVG markup for a 24×24 viewBox, stroke=currentColor */
const PATHS: Record<IconName, ReactElement> = {
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <circle cx="8.5" cy="8.5" r="1.6" />
      <path d="M21 15l-5-5L5 21" />
    </>
  ),
  text: <path d="M5 5h14M12 5v14M9 19h6" />,
  layout: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M3 9h18M9 21V9" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 100 18c1 0 1.5-.8 1.5-1.7 0-.5-.2-.9-.5-1.2-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H16a5 5 0 005-5c0-3.9-4-7-9-7z" />
      <circle cx="7.5" cy="10.5" r="1" />
      <circle cx="12" cy="7.5" r="1" />
      <circle cx="16.5" cy="10.5" r="1" />
    </>
  ),
  panels: (
    <>
      <rect x="3" y="4" width="5" height="16" rx="1.2" />
      <rect x="9.5" y="4" width="5" height="16" rx="1.2" />
      <rect x="16" y="4" width="5" height="16" rx="1.2" />
    </>
  ),
  layers: <path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z" />,
  heart: (
    <path d="M12 20s-7-4.4-9.2-8.4C1.3 8.9 2.6 5.5 5.9 5.5c2 0 3.3 1.3 4.1 2.5.8-1.2 2.1-2.5 4.1-2.5 3.3 0 4.6 3.4 3.1 6.1C19 15.6 12 20 12 20z" />
  ),
  pin: (
    <>
      <path d="M12 21c4-4.5 7-7.9 7-11a7 7 0 10-14 0c0 3.1 3 6.5 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  play: <path d="M7 5l12 7-12 7z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  undo: <path d="M9 7L4 12l5 5M4 12h11a5 5 0 010 10h-1" />,
  redo: <path d="M15 7l5 5-5 5M20 12H9a5 5 0 000 10h1" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  'chevron-left': <path d="M15 6l-6 6 6 6" />,
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  sparkles: (
    <path d="M12 3l1.8 4.4L18 9l-4.2 1.6L12 15l-1.8-4.4L6 9l4.2-1.6L12 3zM18.5 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
  ),
  share: (
    <>
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M5 12v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11M8 11l4 4 4-4" />
      <path d="M5 19h14" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
    </>
  ),
  wand: <path d="M15 4V2M15 10V8M18.5 6.5L20 5M18.5 6.5L20 8M11.5 6.5L10 5M4 20l9-9M13 9l2 2" />,
  music: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 8h9M17 8h3M4 16h3M11 16h9" />
      <circle cx="15" cy="8" r="2" />
      <circle cx="9" cy="16" r="2" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </>
  ),
};

export default function Icon({
  name,
  size = 22,
  className,
  strokeWidth = 1.8,
  filled = false,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  /** solid fill (for star/heart when active) */
  filled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
