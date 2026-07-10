import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { classifyFile } from './importPhotos';

describe('classifyFile (iOS-reality file classification)', () => {
  it('accepts iPhone QuickTime videos', () => {
    expect(classifyFile({ name: 'IMG_1870.MOV', type: 'video/quicktime' })).toBe('video');
    expect(classifyFile({ name: 'clip.m4v', type: 'video/x-m4v' })).toBe('video');
  });

  it('accepts standard videos', () => {
    expect(classifyFile({ name: 'a.mp4', type: 'video/mp4' })).toBe('video');
    expect(classifyFile({ name: 'a.webm', type: 'video/webm' })).toBe('video');
  });

  it('accepts any image/* mime type (the decoder is the real gate)', () => {
    expect(classifyFile({ name: 'IMG_1.HEIC', type: 'image/heic' })).toBe('image');
    expect(classifyFile({ name: 'x.jpg', type: 'image/jpeg' })).toBe('image');
    expect(classifyFile({ name: 'x.gif', type: 'image/gif' })).toBe('image');
    expect(classifyFile({ name: 'weird.xyz', type: 'image/x-obscure' })).toBe('image');
  });

  it('classifies by extension when the mime type is empty (iOS picker quirk)', () => {
    expect(classifyFile({ name: 'IMG_2001.HEIC', type: '' })).toBe('image');
    expect(classifyFile({ name: 'IMG_2002.MOV', type: '' })).toBe('video');
    expect(classifyFile({ name: 'photo.jpeg', type: '' })).toBe('image');
  });

  it('rejects genuinely unsupported files', () => {
    expect(classifyFile({ name: 'doc.pdf', type: 'application/pdf' })).toBeNull();
    expect(classifyFile({ name: 'notes.txt', type: '' })).toBeNull();
    expect(classifyFile({ name: 'a.avi', type: 'video/x-msvideo' })).toBeNull();
  });
});
