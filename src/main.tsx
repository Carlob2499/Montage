import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';
import { ensureFontsLoaded } from './lib/fonts';
import { db } from './db/db';
import { useUIStore } from './state/uiStore';

// Surface a visible, tappable prompt when a new version is waiting — without
// this, installed home-screen PWAs keep running the old cached bundle and
// shipped fixes never load.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    useUIStore.getState().toast('Update available — tap to reload', 'info', {
      sticky: true,
      onAction: () => void updateSW(true),
    });
  },
});

// Detect IndexedDB failure (Private Browsing, blocked upgrade) up front and
// tell the user, instead of silently failing every save.
db.open().catch((err) => {
  console.error('IndexedDB open failed', err);
  useUIStore
    .getState()
    .toast(
      'Storage is unavailable — Private Browsing or a blocked update can cause this. Photos may not save.',
      'error',
      { sticky: true },
    );
});

void ensureFontsLoaded();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
