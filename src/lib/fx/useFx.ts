// ---------------------------------------------------------------------------
// Motion system (GSAP): one orchestrated entrance per screen, a pointer-tilt
// for the hero, and nothing else scattered around. Every effect is gated on
// prefers-reduced-motion and cleans itself up on unmount.
// ---------------------------------------------------------------------------

import { useEffect } from 'react';
import type { RefObject } from 'react';
import gsap from 'gsap';

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Cinematic entrance: children of `ref` marked with [data-rise] rise and fade
 * in with a gentle stagger, once, on mount. Marked elements start hidden via
 * inline style so there's no flash before GSAP takes over.
 */
export function useEntrance(ref: RefObject<HTMLElement | null>, deps: unknown[] = []): void {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const items = root.querySelectorAll<HTMLElement>('[data-rise]');
    if (!items.length) return;
    if (prefersReducedMotion()) {
      items.forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
      return;
    }
    const tween = gsap.fromTo(
      items,
      { opacity: 0, y: 26, scale: 0.985 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.85,
        ease: 'power3.out',
        stagger: 0.08,
        clearProps: 'transform',
      },
    );
    return () => {
      tween.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Pointer tilt: the element leans toward the pointer (max ~2.5°) with a soft
 * spring back on leave. Touch devices skip it (the ambient beam drift carries
 * the motion instead).
 */
export function useTilt(ref: RefObject<HTMLElement | null>, maxDeg = 2.5): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) return;

    const setRX = gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: 'power2.out' });
    const setRY = gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: 'power2.out' });
    gsap.set(el, { transformPerspective: 900 });

    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      setRX(-py * maxDeg * 2);
      setRY(px * maxDeg * 2);
    };
    const leave = () => {
      setRX(0);
      setRY(0);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      gsap.killTweensOf(el);
    };
  }, [ref, maxDeg]);
}
