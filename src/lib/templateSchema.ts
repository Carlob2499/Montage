// ---------------------------------------------------------------------------
// Template JSON schema validation. Templates are plain JSON so the user can
// author their own; validation gives actionable errors instead of a broken
// canvas. Unit tested in templateSchema.test.ts.
// ---------------------------------------------------------------------------

import type { TemplateDef, TemplateCategory } from '../types';

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  'travel',
  'event',
  'editorial',
  'minimal',
  'film-strip',
  'before-after',
];

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const inRange = (v: number, min: number, max: number) => v >= min && v <= max;

export function validateTemplate(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['template must be a JSON object'] };
  }
  const t = raw as Record<string, unknown>;

  if (typeof t.id !== 'string' || !t.id.trim()) errors.push('id: non-empty string required');
  if (typeof t.name !== 'string' || !t.name.trim())
    errors.push('name: non-empty string required');
  if (!TEMPLATE_CATEGORIES.includes(t.category as TemplateCategory))
    errors.push(`category: must be one of ${TEMPLATE_CATEGORIES.join(', ')}`);
  if (!isNum(t.panels) || !Number.isInteger(t.panels) || t.panels < 1 || t.panels > 30)
    errors.push('panels: integer between 1 and 30 required');
  if (t.aspect !== 'any' && t.aspect !== '4:5' && t.aspect !== '1:1' && t.aspect !== '9:16')
    errors.push("aspect: must be '4:5', '1:1', '9:16' or 'any'");

  if (!Array.isArray(t.cells) || t.cells.length === 0) {
    errors.push('cells: non-empty array required');
  } else {
    (t.cells as unknown[]).forEach((c, i) => {
      if (typeof c !== 'object' || c === null) {
        errors.push(`cells[${i}]: must be an object`);
        return;
      }
      const cell = c as Record<string, unknown>;
      for (const key of ['x', 'y', 'w', 'h'] as const) {
        if (!isNum(cell[key])) {
          errors.push(`cells[${i}].${key}: number required`);
        }
      }
      if (isNum(cell.x) && !inRange(cell.x, 0, 1)) errors.push(`cells[${i}].x: must be 0..1`);
      if (isNum(cell.y) && !inRange(cell.y, 0, 1)) errors.push(`cells[${i}].y: must be 0..1`);
      if (isNum(cell.w) && !(cell.w > 0 && cell.w <= 1))
        errors.push(`cells[${i}].w: must be in (0, 1]`);
      if (isNum(cell.h) && !(cell.h > 0 && cell.h <= 1))
        errors.push(`cells[${i}].h: must be in (0, 1]`);
      if (isNum(cell.x) && isNum(cell.w) && cell.x + cell.w > 1.0001)
        errors.push(`cells[${i}]: x + w exceeds canvas (${cell.x} + ${cell.w})`);
      if (isNum(cell.y) && isNum(cell.h) && cell.y + cell.h > 1.0001)
        errors.push(`cells[${i}]: y + h exceeds canvas (${cell.y} + ${cell.h})`);
      if (cell.r !== undefined && (!isNum(cell.r) || cell.r < 0))
        errors.push(`cells[${i}].r: must be a non-negative number`);
    });
  }

  if (t.texts !== undefined) {
    if (!Array.isArray(t.texts)) {
      errors.push('texts: must be an array when present');
    } else {
      (t.texts as unknown[]).forEach((txt, i) => {
        if (typeof txt !== 'object' || txt === null) {
          errors.push(`texts[${i}]: must be an object`);
          return;
        }
        const tx = txt as Record<string, unknown>;
        if (!isNum(tx.x) || !inRange(tx.x, 0, 1)) errors.push(`texts[${i}].x: number 0..1 required`);
        if (!isNum(tx.y) || !inRange(tx.y, 0, 1)) errors.push(`texts[${i}].y: number 0..1 required`);
        if (typeof tx.text !== 'string') errors.push(`texts[${i}].text: string required`);
        if (!isNum(tx.size) || tx.size <= 0) errors.push(`texts[${i}].size: positive number required`);
      });
    }
  }

  if (t.background !== undefined) {
    const bg = t.background as Record<string, unknown>;
    const kinds = ['solid', 'linear', 'radial', 'blurPhoto'];
    if (typeof bg !== 'object' || bg === null || !kinds.includes(bg.kind as string)) {
      errors.push(`background.kind: must be one of ${kinds.join(', ')}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Validate a whole library; returns only valid templates plus error report. */
export function validateTemplateLibrary(raw: unknown[]): {
  valid: TemplateDef[];
  errors: { index: number; errors: string[] }[];
} {
  const valid: TemplateDef[] = [];
  const errors: { index: number; errors: string[] }[] = [];
  const seenIds = new Set<string>();
  raw.forEach((t, index) => {
    const res = validateTemplate(t);
    const id = (t as TemplateDef)?.id;
    if (res.ok && seenIds.has(id)) {
      errors.push({ index, errors: [`duplicate template id '${id}'`] });
      return;
    }
    if (res.ok) {
      seenIds.add(id);
      valid.push(t as TemplateDef);
    } else {
      errors.push({ index, errors: res.errors });
    }
  });
  return { valid, errors };
}
