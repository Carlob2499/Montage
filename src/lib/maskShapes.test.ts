import { describe, it, expect } from 'vitest';
import { traceMask, tracePhotoOutline } from './maskShapes';

/** records which path ops were called, for asserting shape structure */
function recorder() {
  const calls: string[] = [];
  const ctx = {
    beginPath: () => calls.push('beginPath'),
    closePath: () => calls.push('closePath'),
    moveTo: () => calls.push('moveTo'),
    lineTo: () => calls.push('lineTo'),
    bezierCurveTo: () => calls.push('bezier'),
    arc: () => calls.push('arc'),
    arcTo: () => calls.push('arcTo'),
    rect: () => calls.push('rect'),
    ellipse: () => calls.push('ellipse'),
  };
  return { ctx, calls };
}

describe('traceMask', () => {
  it('circle uses an ellipse and closes', () => {
    const { ctx, calls } = recorder();
    traceMask(ctx, 'circle', 100, 80);
    expect(calls).toContain('ellipse');
    expect(calls[calls.length - 1]).toBe('closePath');
  });

  it('circle falls back to beziers without ellipse support', () => {
    const { ctx, calls } = recorder();
    const noEllipse = { ...ctx, ellipse: undefined };
    traceMask(noEllipse, 'circle', 100, 80);
    expect(calls.filter((c) => c === 'bezier').length).toBe(4);
  });

  it('arch draws straight sides + a top arc', () => {
    const { ctx, calls } = recorder();
    traceMask(ctx, 'arch', 100, 120);
    expect(calls).toContain('arc');
    expect(calls).toContain('lineTo');
  });

  it('heart and blob are all-bezier closed paths', () => {
    for (const shape of ['heart', 'blob'] as const) {
      const { ctx, calls } = recorder();
      traceMask(ctx, shape, 100, 100);
      expect(calls[0]).toBe('beginPath');
      expect(calls.filter((c) => c === 'bezier').length).toBe(4);
      expect(calls[calls.length - 1]).toBe('closePath');
    }
  });
});

describe('tracePhotoOutline', () => {
  it('delegates to the mask when a shape is set', () => {
    const { ctx, calls } = recorder();
    tracePhotoOutline(ctx, { maskShape: 'heart', cornerRadius: 20, width: 100, height: 100 });
    expect(calls.filter((c) => c === 'bezier').length).toBe(4); // heart
    expect(calls).not.toContain('arcTo');
  });

  it('draws a rounded rect (arcTo) when no mask and cornerRadius > 0', () => {
    const { ctx, calls } = recorder();
    tracePhotoOutline(ctx, { cornerRadius: 20, width: 100, height: 100 });
    expect(calls.filter((c) => c === 'arcTo').length).toBe(4);
  });

  it('draws a plain rect when cornerRadius is 0', () => {
    const { ctx, calls } = recorder();
    tracePhotoOutline(ctx, { cornerRadius: 0, width: 100, height: 100 });
    expect(calls).toContain('rect');
    expect(calls).not.toContain('arcTo');
  });
});
