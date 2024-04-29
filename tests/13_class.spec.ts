import { describe, expect, it } from 'vitest';
import { createProxy, isChanged, markToTrack } from 'proxy-compare';

const noop = (_arg: unknown) => {
  // do nothing
};

describe('class spec', () => {
  class C {
    a = 1;
  }

  it('normal', () => {
    const proxyCache = new WeakMap();
    const s1 = new C();
    markToTrack(s1);
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.a);
    expect(isChanged(s1, s1, a1)).toBe(false);
    expect(isChanged(s1, { a: 1 }, a1)).toBe(false);
    expect(isChanged(s1, { a: 2 }, a1)).toBe(true);
    expect(Object.getPrototypeOf(p1) === C.prototype).toBe(true);
  });

  it('frozen', () => {
    const proxyCache = new WeakMap();
    const s1 = new C();
    Object.freeze(s1);
    markToTrack(s1);
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.a);
    expect(isChanged(s1, s1, a1)).toBe(false);
    expect(isChanged(s1, { a: 1 }, a1)).toBe(false);
    expect(isChanged(s1, { a: 2 }, a1)).toBe(true);
    expect(Object.getPrototypeOf(p1) === C.prototype).toBe(true);
  });
});
