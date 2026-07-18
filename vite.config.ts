import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Deployed at https://carlob2499.github.io/Montage/
export default defineConfig({
  base: '/Montage/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' (not 'autoUpdate') so onNeedRefresh fires and we can show a
      // visible "reload to update" toast — critical so shipped fixes actually
      // load on installed home-screen PWAs instead of running a stale bundle.
      registerType: 'prompt',
      includeAssets: ['icons/icon.svg'],
      // custom SW: workbox precache + Web Share Target inbox
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      manifest: {
        name: 'Montage Studio',
        short_name: 'Montage',
        description:
          'Photo collage and seamless Instagram carousel studio. Local-first — photos never leave your device.',
        theme_color: '#0e0c0a',
        background_color: '#0e0c0a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/Montage/',
        scope: '/Montage/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Android: appear as a destination in the OS share sheet
        share_target: {
          action: '/Montage/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [
              {
                name: 'photos',
                accept: ['image/*', 'video/mp4', 'video/webm'],
              },
            ],
          },
        },
      } as never,
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as never);
