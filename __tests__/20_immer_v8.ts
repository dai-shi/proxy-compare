import { createDeepProxy, isDeepChanged } from '../src/index';

const noop = (_arg: unknown) => {
  // do nothing
};

describe('immer v8', () => {
  // See: https://github.com/dai-shi/react-tracked/issues/79
  it('should work with read-only and non-configurable object', () => {
    const proxyCache = new WeakMap();
    const s1: { a?: unknown } = {};
    Object.defineProperty(s1, 'a', {
      configurable: false,
      writable: false,
      value: { b: 1 },
    });
    const a1 = new WeakMap();
    const p1 = createDeepProxy(s1, a1, proxyCache);
    noop(p1.a);
    expect(isDeepChanged(s1, s1, a1)).toBe(false);
    expect(isDeepChanged(s1, { a: s1.a }, a1)).toBe(false);
    expect(isDeepChanged(s1, { a: { b: 1 } }, a1)).toBe(true);
  });
});
