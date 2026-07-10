import { useMemo } from 'react';
import { useUIStore } from '../../state/uiStore';

/**
 * Cover page: first-launch introduction with the install-as-app guide.
 * Reachable again later via "About" on the Home screen.
 */
export default function WelcomeScreen() {
  const dismissWelcome = useUIStore((s) => s.dismissWelcome);
  const go = useUIStore((s) => s.go);

  const isIOS = useMemo(
    () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent),
    [],
  );
  const isStandalone = useMemo(
    () =>
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true),
    [],
  );

  const start = (dest: 'library' | 'home') => {
    dismissWelcome();
    go(dest);
  };

  return (
    <div className="relative flex h-full flex-col overflow-y-auto bg-[#12101d] text-white">
      {/* ambient gradient blobs */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.45),transparent_70%)]" />
      <div className="pointer-events-none absolute -right-20 top-40 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(244,114,182,0.35),transparent_70%)]" />
      <div className="pointer-events-none absolute -bottom-24 left-1/4 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(252,217,168,0.25),transparent_70%)]" />

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-6 pt-[max(env(safe-area-inset-top),2.5rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <div className="pt-8">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-200/80">
            Local-first · No accounts · Free forever
          </div>
          <h1 className="mt-3 font-['Playfair_Display'] text-5xl font-bold leading-tight">
            Montage
            <br />
            <span className="bg-gradient-to-r from-amber-200 via-pink-300 to-violet-300 bg-clip-text text-transparent">
              Studio
            </span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-white/75">
            Compose one wide, continuous canvas — Montage slices it into pixel-perfect
            Instagram panels that flow seamlessly as you swipe.
          </p>
        </div>

        {/* seamless-panels motif */}
        <div className="mt-7">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 flex-1 rounded-md"
                style={{
                  background: `linear-gradient(120deg, #fbbf24 ${-i * 34}%, #f472b6 ${55 - i * 34}%, #7c3aed ${130 - i * 34}%)`,
                }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-center gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`h-1 w-1 rounded-full ${i === 0 ? 'bg-white' : 'bg-white/30'}`} />
            ))}
          </div>
        </div>

        <ul className="mt-7 space-y-3.5 text-sm">
          <Feature icon="✨" title="One-tap layouts" text="Photo dumps, scrapbook scatters, trip recaps with stats — generated instantly." />
          <Feature icon="🎞" title="Real editing" text="Non-destructive adjustments, film grain, polaroid & torn-paper frames, 37 templates." />
          <Feature icon="📤" title="Straight to Instagram" text="Export exact 1080×1350 panels to your share sheet, ZIP, or auto-scroll video." />
          <Feature icon="🔒" title="Yours only" text="Photos never leave this device. Works fully offline once loaded." />
        </ul>

        <div className="mt-8 space-y-2.5">
          <button
            className="w-full rounded-2xl bg-gradient-to-r from-amber-300 via-pink-400 to-violet-500 py-3.5 text-base font-bold text-ink-950 shadow-lg transition-transform active:scale-[0.98]"
            onClick={() => start('library')}
          >
            Start — import your photos
          </button>
          <button
            className="w-full rounded-2xl border border-white/20 py-3 text-sm font-semibold text-white/85"
            onClick={() => start('home')}
          >
            Explore first
          </button>
        </div>

        {!isStandalone && (
          <div className="mt-7 rounded-2xl border border-white/15 bg-white/5 p-4 text-xs leading-relaxed text-white/70">
            <div className="mb-1 text-sm font-semibold text-white/90">📱 Keep it as an app</div>
            {isIOS ? (
              <>
                Tap the <b>Share</b> button in Safari, then <b>“Add to Home Screen”</b>. Montage
                installs like a native app — full screen, offline, with its own icon.
              </>
            ) : (
              <>
                Open the browser menu (⋮) and choose <b>“Install app”</b> / “Add to Home screen”.
                Montage runs full screen and offline, and appears in your device's share sheet.
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-lg">
        {icon}
      </span>
      <div>
        <div className="font-semibold text-white/95">{title}</div>
        <div className="text-white/65">{text}</div>
      </div>
    </li>
  );
}
