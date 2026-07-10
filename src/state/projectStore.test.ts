import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeProjectDoc, useProjectStore } from './projectStore';

const store = () => useProjectStore.getState();

beforeEach(() => {
  useProjectStore.setState({
    doc: null,
    selectedIds: [],
    past: [],
    future: [],
    dirty: false,
    previewBase: null,
  });
  store().loadProject(makeProjectDoc('t', 'carousel', '4:5', 3));
});

describe('preview/commit undo semantics', () => {
  it('a preview gesture lands as ONE undo entry restoring the pre-gesture state', () => {
    store().commit((d) => ({ ...d, name: 'named' }));
    // simulate typing/slider ticks
    store().preview((d) => ({ ...d, gutter: 30 }));
    store().preview((d) => ({ ...d, gutter: 40 }));
    store().preview((d) => ({ ...d, gutter: 50 }));
    store().commitPreview();
    expect(store().doc?.gutter).toBe(50);

    store().undo();
    expect(store().doc?.gutter).toBe(24); // pre-gesture value, one step
    expect(store().doc?.name).toBe('named'); // earlier commit untouched

    store().redo();
    expect(store().doc?.gutter).toBe(50);
  });

  it('commit() after previews pushes the pre-preview base, not the previewed doc', () => {
    store().preview((d) => ({ ...d, gutter: 99 }));
    store().commit((d) => ({ ...d, margin: 10 }));
    expect(store().doc?.gutter).toBe(99);
    expect(store().doc?.margin).toBe(10);
    store().undo();
    // one undo reverts BOTH the preview and the commit to the base state
    expect(store().doc?.gutter).toBe(24);
    expect(store().doc?.margin).toBe(48);
  });

  it('undo during an uncommitted preview reverts to the preview base first', () => {
    store().commit((d) => ({ ...d, name: 'step1' }));
    store().preview((d) => ({ ...d, gutter: 77 }));
    store().undo();
    expect(store().doc?.gutter).toBe(24);
    expect(store().doc?.name).toBe('step1'); // did NOT consume a history step
    expect(store().past).toHaveLength(1);
  });

  it('commitPreview without an active preview adds no history noise', () => {
    const pastLen = store().past.length;
    store().commitPreview();
    expect(store().past).toHaveLength(pastLen);
  });

  it('transient updateLayers does not flood history; plain updateLayers commits', () => {
    store().commit((d) => ({
      ...d,
      layers: [
        {
          id: 'a',
          type: 'text',
          text: 'x',
          x: 0,
          y: 0,
          rotation: 0,
          opacity: 1,
          fontFamily: 'Inter',
          fontSize: 50,
          fontWeight: 400,
          letterSpacing: 0,
          lineHeight: 1,
          fill: '#000',
          align: 'left',
        },
      ],
    }));
    const pastLen = store().past.length;
    for (let i = 0; i < 20; i++) {
      store().updateLayers(['a'], (l) => ({ ...l, opacity: i / 20 }), { transient: true });
    }
    expect(store().past).toHaveLength(pastLen); // no entries during the drag
    store().commitPreview();
    expect(store().past).toHaveLength(pastLen + 1); // exactly one for the gesture
  });

  it('50-step history cap holds', () => {
    for (let i = 0; i < 60; i++) store().commit((d) => ({ ...d, gutter: i }));
    expect(store().past.length).toBeLessThanOrEqual(50);
    // undo all the way — never throws, lands on the oldest retained state
    for (let i = 0; i < 60; i++) store().undo();
    expect(store().doc?.gutter).toBe(9); // 60 commits, 50 kept → oldest is #9's base
  });
});
