import { useMemo, useRef } from 'react';
import { useUIStore } from '../../state/uiStore';
import { useEntrance } from '../../lib/fx/useFx';

/**
 * Cover page: a slate, not a splash. First-launch introduction with the
 * install-as-app guide; reachable again later via "About" on Home.
 */
export default function WelcomeScreen() {
  const dismissWelcome = useUIStore((s) => s.dismissWelcome);
  const go = useUIStore((s) => s.go);
  const rootRef = useRef<HTMLDivElement>(null);
  useEntrance(rootRef, []);

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

  const start = () => {
    dismissWelcome();
    go('home');
  };

  return (
    <div ref={rootRef} className="relative flex h-full flex-col overflow-y-auto bg-ink-950 text-ink-100">
      <div className="film-grain" aria-hidden />

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-6 pt-[max(env(safe-area-inset-top),2.5rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <div data-rise className="pt-8" style={{ opacity: 0 }}>
          <div className="flex items-center justify-between">
            <span className="meta">On your device · no accounts · free</span>
            <span className="flex items-center gap-2">
              <span className="rec-dot" aria-hidden />
              <span className="meta text-accent-400">Rec</span>
            </span>
          </div>
          <h1 className="mt-6 font-display text-[3.6rem] font-bold uppercase leading-[0.95] tracking-[-0.03em] text-ink-50">
            Mont
            <br />
            age<span className="text-accent-500">.</span>
          </h1>
          <p className="mt-5 max-w-[36ch] text-[15px] leading-relaxed text-ink-300">
            Drop in a trip's photos. Get back a short film — cut to music — and a
            seamless carousel, ready to post.
          </p>
        </div>

        {/* seamless-panels motif: numbered frames, one live */}
        <div data-rise className="mt-8" style={{ opacity: 0 }}>
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`flex h-24 flex-1 items-end rounded-sm border p-1.5 ${
                  i === 0 ? 'border-accent-500 bg-ink-800' : 'border-ink-700 bg-ink-900'
                }`}
              >
                <span className={`meta ${i === 0 ? 'text-accent-400' : ''}`}>0{i + 1}</span>
              </div>
            ))}
          </div>
          <p className="meta mt-2 normal-case tracking-[0.14em]">
            One continuous canvas → pixel-seamless panels
          </p>
        </div>

        <ul data-rise className="mt-8 space-y-0 text-sm" style={{ opacity: 0 }}>
          <Feature n="01" title="It edits for you" text="The best shots are chosen, framed and cut on the beat — nothing to learn." />
          <Feature n="02" title="Reels & carousels" text="One tap makes a 9:16 film and a seamless swipe carousel." />
          <Feature n="03" title="Straight to Instagram" text="Exports at exact native sizes, into your share sheet." />
          <Feature n="04" title="Private by design" text="Photos never leave this device. Works fully offline." />
        </ul>

        <div data-rise className="mt-9" style={{ opacity: 0 }}>
          <button
            className="btn-primary w-full rounded-2xl py-4 text-base"
            onClick={start}
          >
            Get started
          </button>
        </div>

        {!isStandalone && (
          <div data-rise className="mt-7 rounded-2xl border border-ink-700/60 bg-ink-900/70 p-4 text-xs leading-relaxed text-ink-300" style={{ opacity: 0 }}>
            <div className="mb-1 text-sm font-semibold text-ink-100">Keep it as an app</div>
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

function Feature({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <li className="hairline flex items-baseline gap-4 border-t py-3.5 last:border-b">
      <span className="meta shrink-0">{n}</span>
      <div>
        <div className="font-semibold text-ink-50">{title}</div>
        <div className="mt-0.5 text-[13px] leading-relaxed text-ink-400">{text}</div>
      </div>
    </li>
  );
}
