import { useMemo, useRef } from 'react';
import { useUIStore } from '../../state/uiStore';
import Icon from '../shared/Icon';
import { useEntrance } from '../../lib/fx/useFx';

/**
 * Cover page: the projector warming up. First-launch introduction with the
 * install-as-app guide; reachable again later via "about" on Home.
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
      {/* the projector beam, cast from above */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[55%] w-[150%] -translate-x-1/2"
        style={{
          background:
            'radial-gradient(ellipse 42% 58% at 50% 0%, rgb(248 192 106 / 0.18), rgb(242 122 157 / 0.06) 55%, transparent 75%)',
        }}
      />

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-6 pt-[max(env(safe-area-inset-top),2.5rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <div data-rise className="pt-10" style={{ opacity: 0 }}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-accent-300/90">
            On your device · No accounts · Free
          </div>
          <h1 className="mt-4 font-serif text-[3.4rem] font-bold leading-[1.02] tracking-tight text-ink-50">
            Montage
            <br />
            <span className="bg-clip-text italic text-transparent" style={{ backgroundImage: 'var(--beam)' }}>
              Studio
            </span>
          </h1>
          <p className="mt-4 max-w-[34ch] text-[15px] leading-relaxed text-ink-300">
            Drop in a trip's photos. Get back a short film — cut to music — and a
            seamless carousel, ready to post.
          </p>
        </div>

        {/* seamless-panels motif, warm-graded */}
        <div data-rise className="mt-8" style={{ opacity: 0 }}>
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 flex-1 rounded-md"
                style={{
                  background: `linear-gradient(120deg, #f8c06a ${-i * 34}%, #f27a9d ${55 - i * 34}%, #8f6bff ${130 - i * 34}%)`,
                  filter: 'saturate(0.92) brightness(0.96)',
                }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-center gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`h-1 w-1 rounded-full ${i === 0 ? 'bg-ink-100' : 'bg-ink-600'}`} />
            ))}
          </div>
        </div>

        <ul data-rise className="mt-8 space-y-4 text-sm" style={{ opacity: 0 }}>
          <Feature icon="sparkles" title="It edits for you" text="The best shots are chosen, framed and cut on the beat — nothing to learn." />
          <Feature icon="video" title="Reels & carousels" text="One tap makes a 9:16 film and a pixel-seamless swipe carousel." />
          <Feature icon="share" title="Straight to Instagram" text="Exports at exact native sizes, into your share sheet." />
          <Feature icon="eye" title="Private by design" text="Photos never leave this device. Works fully offline." />
        </ul>

        <div data-rise className="mt-9" style={{ opacity: 0 }}>
          <button
            className="w-full rounded-2xl py-4 text-base font-bold text-ink-950 shadow-lg transition-transform active:scale-[0.98]"
            style={{ backgroundImage: 'linear-gradient(to bottom, var(--color-accent-300), var(--color-accent-500))' }}
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

function Feature({
  icon,
  title,
  text,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  text: string;
}) {
  return (
    <li className="flex items-start gap-3.5">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-ink-700/60 bg-ink-900 text-accent-300">
        <Icon name={icon} size={17} />
      </span>
      <div>
        <div className="font-semibold text-ink-50">{title}</div>
        <div className="mt-0.5 leading-relaxed text-ink-400">{text}</div>
      </div>
    </li>
  );
}
