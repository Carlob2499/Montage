import { describe, it, expect } from 'vitest';
import { validateTemplate, validateTemplateLibrary } from './templateSchema';
import { TEMPLATES } from '../templates/templates';

const goodTemplate = () => ({
  id: 'test-1',
  name: 'Test',
  category: 'minimal',
  panels: 2,
  aspect: 'any',
  cells: [
    { x: 0, y: 0, w: 0.5, h: 1 },
    { x: 0.5, y: 0.1, w: 0.4, h: 0.8, r: 24 },
  ],
});

describe('validateTemplate', () => {
  it('accepts a well-formed template', () => {
    expect(validateTemplate(goodTemplate())).toEqual({ ok: true, errors: [] });
  });

  it('rejects non-objects', () => {
    expect(validateTemplate(null).ok).toBe(false);
    expect(validateTemplate([]).ok).toBe(false);
    expect(validateTemplate('x').ok).toBe(false);
  });

  it('requires id, name, category, panels, aspect', () => {
    const t = { ...goodTemplate(), id: '', category: 'fancy', panels: 0, aspect: '16:9' };
    const res = validateTemplate(t);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/id/);
    expect(res.errors.join(' ')).toMatch(/category/);
    expect(res.errors.join(' ')).toMatch(/panels/);
    expect(res.errors.join(' ')).toMatch(/aspect/);
  });

  it('rejects cells outside the canvas', () => {
    const t = { ...goodTemplate(), cells: [{ x: 0.8, y: 0, w: 0.5, h: 1 }] };
    const res = validateTemplate(t);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toMatch(/x \+ w exceeds/);
  });

  it('rejects zero-size cells', () => {
    const t = { ...goodTemplate(), cells: [{ x: 0, y: 0, w: 0, h: 1 }] };
    expect(validateTemplate(t).ok).toBe(false);
  });

  it('rejects empty cell arrays', () => {
    expect(validateTemplate({ ...goodTemplate(), cells: [] }).ok).toBe(false);
  });

  it('validates text entries when present', () => {
    const t = {
      ...goodTemplate(),
      texts: [{ x: 0.5, y: 2, text: 'hi', size: -1 }],
    };
    const res = validateTemplate(t);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/texts\[0\]\.y/);
    expect(res.errors.join(' ')).toMatch(/texts\[0\]\.size/);
  });

  it('validates background kind when present', () => {
    const t = { ...goodTemplate(), background: { kind: 'plaid' } };
    expect(validateTemplate(t).ok).toBe(false);
  });
});

describe('validateTemplateLibrary', () => {
  it('separates valid templates from broken ones', () => {
    const { valid, errors } = validateTemplateLibrary([
      goodTemplate(),
      { id: 'bad' },
    ]);
    expect(valid).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].index).toBe(1);
  });

  it('rejects duplicate ids', () => {
    const { valid, errors } = validateTemplateLibrary([goodTemplate(), goodTemplate()]);
    expect(valid).toHaveLength(1);
    expect(errors[0].errors[0]).toMatch(/duplicate/);
  });
});

describe('bundled template library', () => {
  it('ships at least 25 templates', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(25);
  });

  it('every bundled template passes validation', () => {
    const { valid, errors } = validateTemplateLibrary(TEMPLATES);
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(TEMPLATES.length);
  });

  it('covers all seven categories', () => {
    const cats = new Set(TEMPLATES.map((t) => t.category));
    expect(cats).toEqual(
      new Set([
        'travel',
        'event',
        'editorial',
        'minimal',
        'film-strip',
        'before-after',
        'scrapbook',
      ]),
    );
  });

  it('scrapbook cells carry valid rotation and frame styles', () => {
    const scrap = TEMPLATES.filter((t) => t.category === 'scrapbook');
    expect(scrap.length).toBeGreaterThanOrEqual(5);
    const frames = new Set(
      scrap.flatMap((t) => t.cells.map((c) => c.frame).filter(Boolean)),
    );
    expect(frames).toEqual(new Set(['polaroid', 'tape', 'torn']));
  });

  it('includes multi-panel seamless layouts', () => {
    expect(TEMPLATES.some((t) => t.panels >= 3)).toBe(true);
    // at least one template has a cell spanning more than one panel width
    const spanning = TEMPLATES.some((t) =>
      t.cells.some((c) => c.w > 1 / t.panels + 0.001),
    );
    expect(spanning).toBe(true);
  });
});
