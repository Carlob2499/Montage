/// <reference lib="webworker" />
// Custom service worker: workbox precaching (offline PWA) + Web Share Target
// handling — photos shared from the OS share sheet land in an inbox cache
// that the app drains into the library on next launch.

import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA navigation fallback (except the share-target endpoint)
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/share-target/],
  }),
);

export const SHARE_INBOX_CACHE = 'share-target-inbox';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const files = formData.getAll('photos').filter((f): f is File => f instanceof File);
          const cache = await caches.open(SHARE_INBOX_CACHE);
          let i = 0;
          for (const file of files) {
            const key = `${url.origin}/Montage/__shared/${Date.now()}-${i++}`;
            await cache.put(
              key,
              new Response(file, {
                headers: {
                  'content-type': file.type || 'application/octet-stream',
                  'x-file-name': encodeURIComponent(file.name || `shared-${i}.jpg`),
                },
              }),
            );
          }
        } catch {
          // fall through — still land the user in the app
        }
        return Response.redirect('/Montage/?shared=1', 303);
      })(),
    );
  }
});
