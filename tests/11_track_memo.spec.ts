import { describe, expect, it } from 'vitest';
import { createProxy, isChanged, trackMemo } from 'proxy-compare';

const noop = (_arg: unknown) => {
  // do nothing
};

describe('object tracking', () => {
  it('should fail without trackMemo', () => {
    const proxyCache = new WeakMap();
    const s1 = { a: { b: 1, c: 2 } };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.a.b);
    expect(isChanged(s1, { a: s1.a }, a1)).toBe(false);
    expect(isChanged(s1, { a: { b: 3, c: 2 } }, a1)).toBe(true);
    expect(isChanged(s1, { a: { b: 1, c: 3 } }, a1)).not.toBe(true);
  });

  it('should work with trackMemo', () => {
    const proxyCache = new WeakMap();
    const s1 = { a: { b: 1, c: 2 } };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.a.b);
    trackMemo(p1.a);
    expect(isChanged(s1, { a: s1.a }, a1)).toBe(false);
    expect(isChanged(s1, { a: { b: 3, c: 2 } }, a1)).toBe(true);
    expect(isChanged(s1, { a: { b: 1, c: 3 } }, a1)).toBe(true);
  });

  it('should work with trackMemo in advance', () => {
    const proxyCache = new WeakMap();
    const s1 = { a: { b: 1, c: 2 } };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    trackMemo(p1.a);
    noop(p1.a.b);
    expect(isChanged(s1, { a: s1.a }, a1)).toBe(false);
    expect(isChanged(s1, { a: { b: 3, c: 2 } }, a1)).toBe(true);
    expect(isChanged(s1, { a: { b: 1, c: 3 } }, a1)).toBe(true);
  });
});

describe('object tracking two level deep', () => {
  it('should fail without trackMemo', () => {
    const proxyCache = new WeakMap();
    const s1 = { x: { a: { b: 1, c: 2 } } };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.x.a.b);
    expect(isChanged(s1, { x: { a: s1.x.a } }, a1)).toBe(false);
    expect(isChanged(s1, { x: { a: { b: 3, c: 2 } } }, a1)).toBe(true);
    expect(isChanged(s1, { x: { a: { b: 1, c: 3 } } }, a1)).not.toBe(true);
  });

  it('should work with trackMemo', () => {
    const proxyCache = new WeakMap();
    const s1 = { x: { a: { b: 1, c: 2 } } };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.x.a.b);
    trackMemo(p1.x.a);
    expect(isChanged(s1, { x: { a: s1.x.a } }, a1)).toBe(false);
    expect(isChanged(s1, { x: { a: { b: 3, c: 2 } } }, a1)).toBe(true);
    expect(isChanged(s1, { x: { a: { b: 1, c: 3 } } }, a1)).toBe(true);
  });

  it('should work with trackMemo in advance', () => {
    const proxyCache = new WeakMap();
    const s1 = { x: { a: { b: 1, c: 2 } } };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    trackMemo(p1.x.a);
    noop(p1.x.a.b);
    expect(isChanged(s1, { x: { a: s1.x.a } }, a1)).toBe(false);
    expect(isChanged(s1, { x: { a: { b: 3, c: 2 } } }, a1)).toBe(true);
    expect(isChanged(s1, { x: { a: { b: 1, c: 3 } } }, a1)).toBe(true);
  });
});
