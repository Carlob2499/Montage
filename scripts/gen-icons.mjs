// Generates the PWA icons (PNG) and favicon (SVG) without any image deps:
// raw RGBA pixels -> zlib deflate -> hand-assembled PNG chunks.
// Design: deep-ink rounded square, warm-to-blue diagonal gradient band
// sliced by three vertical gaps — the carousel-slicing motif.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => c1.map((v, i) => lerp(v, c2[i], t));

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const bg = [16, 16, 20]; // ink-950
  const warm = [251, 191, 36]; // amber
  const cool = [59, 130, 246]; // blue
  const corner = size * 0.22;
  const bandTop = 0.34;
  const bandBottom = 0.66;
  // three slices with gaps — the carousel motif
  const gaps = [0.365, 0.635];
  const gapW = 0.02;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded-square alpha
      const dx = Math.max(corner - x, x - (size - 1 - corner), 0);
      const dy = Math.max(corner - y, y - (size - 1 - corner), 0);
      const outside = Math.sqrt(dx * dx + dy * dy) > corner;
      if (outside) {
        px[i + 3] = 0;
        continue;
      }
      const u = x / size;
      const v = y / size;
      let color = bg;
      if (v > bandTop && v < bandBottom) {
        const inGap = gaps.some((g) => Math.abs(u - g) < gapW / 2);
        const nearEdge = u < 0.12 || u > 0.88;
        if (!inGap && !nearEdge) {
          const t = (u - 0.12) / 0.76;
          color = mix(warm, cool, t);
          // subtle vertical shading
          const shade = 1 - Math.abs(v - (bandTop + bandBottom) / 2) * 0.6;
          color = color.map((c) => c * (0.85 + 0.15 * shade));
        }
      }
      px[i] = Math.round(color[0]);
      px[i + 1] = Math.round(color[1]);
      px[i + 2] = Math.round(color[2]);
      px[i + 3] = 255;
    }
  }
  return png(size, size, px);
}

writeFileSync(join(outDir, 'icon-180.png'), drawIcon(180)); // apple-touch-icon
writeFileSync(join(outDir, 'icon-192.png'), drawIcon(192));
writeFileSync(join(outDir, 'icon-512.png'), drawIcon(512));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#3b82f6"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="22" fill="#101014"/>
  <g fill="url(#g)">
    <rect x="12" y="34" width="23.5" height="32" rx="2"/>
    <rect x="38.5" y="34" width="23.5" height="32" rx="2"/>
    <rect x="65" y="34" width="23" height="32" rx="2"/>
  </g>
</svg>
`;
writeFileSync(join(outDir, 'icon.svg'), svg);
console.log('icons written to', outDir);
