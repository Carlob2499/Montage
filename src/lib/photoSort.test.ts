import { describe, it, expect } from 'vitest';
import { sortPhotos, searchPhotos, findDuplicates } from './photoSort';
import type { PhotoRecord } from '../types';

let counter = 0;
function photo(partial: Partial<PhotoRecord>): PhotoRecord {
  counter++;
  return {
    id: partial.id ?? `p${counter}`,
    albumId: 'a1',
    fileName: `IMG_${1000 + counter}.jpg`,
    mimeType: 'image/jpeg',
    byteSize: 1000 + counter,
    width: 4000,
    height: 3000,
    dateAdded: counter,
    tags: [],
    order: counter,
    kind: 'image',
    ...partial,
  };
}

describe('sortPhotos by EXIF date taken', () => {
  it('orders by capture time ascending', () => {
    const a = photo({ id: 'a', dateTaken: 3000 });
    const b = photo({ id: 'b', dateTaken: 1000 });
    const c = photo({ id: 'c', dateTaken: 2000 });
    expect(sortPhotos([a, b, c], 'dateTaken').map((p) => p.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('falls back to date added when EXIF is missing', () => {
    const noExif = photo({ id: 'x', dateTaken: undefined, dateAdded: 1500 });
    const early = photo({ id: 'e', dateTaken: 1000 });
    const late = photo({ id: 'l', dateTaken: 2000 });
    expect(sortPhotos([late, noExif, early], 'dateTaken').map((p) => p.id)).toEqual([
      'e',
      'x',
      'l',
    ]);
  });

  it('does not mutate the input array', () => {
    const arr = [photo({ id: 'a', dateTaken: 2 }), photo({ id: 'b', dateTaken: 1 })];
    const ids = arr.map((p) => p.id);
    sortPhotos(arr, 'dateTaken');
    expect(arr.map((p) => p.id)).toEqual(ids);
  });

  it('ties break deterministically by id', () => {
    const a = photo({ id: 'zz', dateTaken: 100 });
    const b = photo({ id: 'aa', dateTaken: 100 });
    expect(sortPhotos([a, b], 'dateTaken').map((p) => p.id)).toEqual(['aa', 'zz']);
    expect(sortPhotos([b, a], 'dateTaken').map((p) => p.id)).toEqual(['aa', 'zz']);
  });
});

describe('sortPhotos other modes', () => {
  it('sorts file names numerically (IMG_2 before IMG_10)', () => {
    const a = photo({ id: 'a', fileName: 'IMG_10.jpg' });
    const b = photo({ id: 'b', fileName: 'IMG_2.jpg' });
    expect(sortPhotos([a, b], 'fileName').map((p) => p.fileName)).toEqual([
      'IMG_2.jpg',
      'IMG_10.jpg',
    ]);
  });

  it('sorts by manual order', () => {
    const a = photo({ id: 'a', order: 5 });
    const b = photo({ id: 'b', order: 1 });
    expect(sortPhotos([a, b], 'manual').map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('sorts by date added', () => {
    const a = photo({ id: 'a', dateAdded: 99 });
    const b = photo({ id: 'b', dateAdded: 1 });
    expect(sortPhotos([a, b], 'dateAdded').map((p) => p.id)).toEqual(['b', 'a']);
  });
});

describe('searchPhotos', () => {
  const beach = photo({ id: 'beach', fileName: 'sunset.jpg', tags: ['beach', 'goa'] });
  const city = photo({ id: 'city', fileName: 'DSC001.jpg', tags: ['tokyo', 'night'] });

  it('matches tags case-insensitively', () => {
    expect(searchPhotos([beach, city], 'BEACH').map((p) => p.id)).toEqual(['beach']);
  });

  it('matches file names', () => {
    expect(searchPhotos([beach, city], 'dsc').map((p) => p.id)).toEqual(['city']);
  });

  it('requires all terms to match (AND)', () => {
    expect(searchPhotos([beach, city], 'beach tokyo')).toEqual([]);
    expect(searchPhotos([beach, city], 'beach sunset').map((p) => p.id)).toEqual([
      'beach',
    ]);
  });

  it('returns everything for a blank query', () => {
    expect(searchPhotos([beach, city], '  ')).toHaveLength(2);
  });
});

describe('findDuplicates', () => {
  it('flags same dimensions + size + capture time', () => {
    const orig = photo({
      id: 'orig',
      width: 100,
      height: 50,
      byteSize: 555,
      dateTaken: 42,
      dateAdded: 1,
    });
    const dupe = photo({
      id: 'dupe',
      width: 100,
      height: 50,
      byteSize: 555,
      dateTaken: 42,
      dateAdded: 2,
    });
    const map = findDuplicates([dupe, orig]);
    expect(map.get('dupe')).toBe('orig');
    expect(map.has('orig')).toBe(false);
  });

  it('never flags photos without EXIF capture time (screenshots/scans collide too easily)', () => {
    const a = photo({ id: 'a', width: 1170, height: 2532, byteSize: 555, dateTaken: undefined });
    const b = photo({ id: 'b', width: 1170, height: 2532, byteSize: 555, dateTaken: undefined });
    expect(findDuplicates([a, b]).size).toBe(0);
  });

  it('does not flag photos differing in any component', () => {
    const a = photo({ id: 'a', width: 100, height: 50, byteSize: 555, dateTaken: 42 });
    const b = photo({ id: 'b', width: 100, height: 50, byteSize: 556, dateTaken: 42 });
    const c = photo({ id: 'c', width: 101, height: 50, byteSize: 555, dateTaken: 42 });
    const d = photo({ id: 'd', width: 100, height: 50, byteSize: 555, dateTaken: 43 });
    expect(findDuplicates([a, b, c, d]).size).toBe(0);
  });
});
