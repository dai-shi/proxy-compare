import { createDeepProxy, isDeepChanged } from '../src/index';

const noop = (_arg: unknown) => {
  // do nothing
};

describe('immer v8', () => {
  // See: https://github.com/dai-shi/react-tracked/issues/79
  it('should work if object is frozen afterward', () => {
    const proxyCache = new WeakMap();
    const s1 = { a: { b: 'b' } };
    const a1 = new WeakMap();
    const p1 = createDeepProxy(s1, a1, proxyCache);
    noop(p1.a);
    expect(isDeepChanged(s1, s1, a1)).toBe(false);
    expect(isDeepChanged(s1, { a: s1.a }, a1)).toBe(false);
    expect(isDeepChanged(s1, { a: { b: 'b' } }, a1)).toBe(true);
    Object.freeze(s1.a);
    Object.freeze(s1);
    const a2 = new WeakMap();
    const p2 = createDeepProxy(s1, a2, proxyCache);
    noop(p2.a.b);
    expect(isDeepChanged(s1, s1, a2)).toBe(false);
    expect(isDeepChanged(s1, { a: s1.a }, a2)).toBe(false);
    expect(isDeepChanged(s1, { a: { b: 'b' } }, a2)).toBe(false);
    expect(isDeepChanged(s1, { a: { b: 'b2' } }, a2)).toBe(true);
  });
});
