import { describe, expect, it } from 'vitest';
import { createProxy, isChanged } from 'proxy-compare';

const noop = (_arg: unknown) => {
  // do nothing
};

describe('object with cycles', () => {
  interface S {
    a: string;
    s?: S;
  }

  it('without cache', () => {
    const s1: S = { a: 'a' };
    s1.s = s1;
    const s2: S = { a: 'a' };
    s2.s = s2;
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1);
    noop(p1.s?.a);
    expect(() => isChanged(s1, s2, a1)).toThrow();
  });

  it('with cache', () => {
    const s1: S = { a: 'a' };
    s1.s = s1;
    const s2: S = { a: 'a' };
    s2.s = s2;
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1);
    noop(p1.s?.a);
    expect(isChanged(s1, s2, a1, new WeakMap())).toBe(false);
  });

  it('with cache with a change', () => {
    const s1: S = { a: 'a' };
    s1.s = s1;
    const s2: S = { a: 'aa' };
    s2.s = s2;
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1);
    noop(p1.s?.a);
    expect(isChanged(s1, s2, a1, new WeakMap())).toBe(true);
  });
});
