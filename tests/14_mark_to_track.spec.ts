import { describe, expect, it } from 'vitest';
import { createProxy, isChanged, markToTrack } from 'proxy-compare';

const noop = (_arg: unknown) => {
  // do nothing
};

describe('object tracking', () => {
  it('should track class instance', () => {
    class C {
      prop = 'prop';
    }
    const c = new C();
    markToTrack(c);
    const s1 = { a: { b: 1, c } };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1);

    noop(p1.a.c.prop);

    expect(isChanged(s1, { a: s1.a }, a1)).toBe(false);
    expect(isChanged(s1, { a: { c: { prop: 'prop' } } }, a1)).toBe(false);
    expect(isChanged(s1, { a: { c: { prop: 'prop2' } } }, a1)).toBe(true);
  });

  it('should not track object', () => {
    const s1 = { a: { b: 1, c: 3 } };
    markToTrack(s1, false);
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1);

    noop(p1.a.b);

    expect(isChanged(s1, { a: s1.a }, a1)).toBe(true);
    expect(isChanged(s1, { a: { b: 3, c: 2 } }, a1)).toBe(true);
    expect(isChanged(s1, { a: { b: 1, c: 3 } }, a1)).toBe(true);
  });

  it('should not track nested object', () => {
    const n1 = { b: 1, c: 3 };

    markToTrack(n1, false);

    const s1 = { a: n1 };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1);

    noop(p1.a.b);

    expect(isChanged(s1, { a: s1.a }, a1)).toBe(false);
    expect(isChanged(s1, { a: { b: 3, c: 2 } }, a1)).toBe(true);
    expect(isChanged(s1, { a: { b: 1, c: 3 } }, a1)).toBe(true);
  });
});
