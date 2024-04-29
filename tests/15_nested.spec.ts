import { describe, expect, it } from 'vitest';
import { createProxy, isChanged, affectedToPathList } from 'proxy-compare';

const noop = (_arg: unknown) => {
  // do nothing
};

describe('nested proxy spec', () => {
  it('embed proxy', () => {
    const proxyCache = new WeakMap();
    const s1 = { a: { b: 'b', c: 'c' } };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    const s2 = { p: p1 }; // embed proxy
    const a2 = new WeakMap();
    const p2 = createProxy(s2, a2, proxyCache);
    noop(p2.p.a.c);
    expect(p2.p).toBe(p1);
    const p11 = createProxy(
      { a: { b: 'b', c: 'c' } },
      new WeakMap(),
      proxyCache,
    );
    const p12 = createProxy(
      { a: { b: 'b2', c: 'c' } },
      new WeakMap(),
      proxyCache,
    );
    const p13 = createProxy(
      { a: { b: 'b', c: 'c2' } },
      new WeakMap(),
      proxyCache,
    );
    expect(isChanged(s2, { p: p11 }, a2)).toBe(false);
    expect(isChanged(s2, { p: p12 }, a2)).toBe(false);
    expect(isChanged(s2, { p: p13 }, a2)).toBe(true);
    expect(affectedToPathList(s2, a2)).toEqual([['p', 'a', 'c']]);
  });

  it('embed proxy with a property', () => {
    const proxyCache = new WeakMap();
    const s1 = { a: { b: 'b', c: 'c' } };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    const s2 = { p: p1, d: 'd' }; // embed proxy
    const a2 = new WeakMap();
    const p2 = createProxy(s2, a2, proxyCache);
    noop(p2.p.a.c);
    noop(p2.d);
    expect(p2.p).toBe(p1);
    const p11 = createProxy(
      { a: { b: 'b', c: 'c' } },
      new WeakMap(),
      proxyCache,
    );
    const p12 = createProxy(
      { a: { b: 'b2', c: 'c' } },
      new WeakMap(),
      proxyCache,
    );
    const p13 = createProxy(
      { a: { b: 'b', c: 'c2' } },
      new WeakMap(),
      proxyCache,
    );
    expect(isChanged(s2, { p: p11, d: 'd' }, a2)).toBe(false);
    expect(isChanged(s2, { p: p12, d: 'd' }, a2)).toBe(false);
    expect(isChanged(s2, { p: p13, d: 'd' }, a2)).toBe(true);
    expect(isChanged(s2, { p: p11, d: 'd2' }, a2)).toBe(true);
    expect(isChanged(s2, { p: p12, d: 'd2' }, a2)).toBe(true);
    expect(isChanged(s2, { p: p13, d: 'd2' }, a2)).toBe(true);
    expect(affectedToPathList(s2, a2)).toEqual([['p', 'a', 'c'], ['d']]);
  });
});
