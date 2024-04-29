/* eslint @typescript-eslint/no-explicit-any: off */

import { describe, expect, it } from 'vitest';
import { createProxy, isChanged, affectedToPathList } from 'proxy-compare';

const noop = (_arg: unknown) => {
  // do nothing
};

describe('shallow object spec', () => {
  it('no property access', () => {
    const s1 = { a: 'a', b: 'b' };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1);
    noop(p1);
    expect(isChanged(s1, { a: 'a', b: 'b' }, a1, undefined)).toBe(true);
    expect(isChanged(s1, { a: 'a2', b: 'b' }, a1, undefined)).toBe(true);
    expect(isChanged(s1, { a: 'a', b: 'b2' }, a1, undefined)).toBe(true);
  });

  it('one property access', () => {
    const s1 = { a: 'a', b: 'b' };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1);
    noop(p1.a);
    expect(isChanged(s1, { a: 'a', b: 'b' }, a1)).toBe(false);
    expect(isChanged(s1, { a: 'a2', b: 'b' }, a1)).toBe(true);
    expect(isChanged(s1, { a: 'a', b: 'b2' }, a1)).toBe(false);
  });
});

describe('deep object spec', () => {
  it('intermediate property access', () => {
    const s1 = { a: { b: 'b', c: 'c' } };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1);
    noop(p1.a);
    expect(isChanged(s1, { a: s1.a }, a1)).toBe(false);
    expect(isChanged(s1, { a: { b: 'b2', c: 'c' } }, a1)).toBe(true);
    expect(isChanged(s1, { a: { b: 'b', c: 'c2' } }, a1)).toBe(true);
  });

  it('leaf property access', () => {
    const s1 = { a: { b: 'b', c: 'c' } };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1);
    noop(p1.a.b);
    expect(isChanged(s1, { a: s1.a }, a1)).toBe(false);
    expect(isChanged(s1, { a: { b: 'b2', c: 'c' } }, a1)).toBe(true);
    expect(isChanged(s1, { a: { b: 'b', c: 'c2' } }, a1)).toBe(false);
  });
});

describe('reference equality spec', () => {
  it('simple', () => {
    const proxyCache = new WeakMap();
    const s1 = { a: 'a', b: 'b' };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.a);
    const s2 = s1; // keep the reference
    const a2 = new WeakMap();
    const p2 = createProxy(s2, a2, proxyCache);
    noop(p2.b);
    expect(p1).toBe(p2);
    expect(isChanged(s1, { a: 'a', b: 'b' }, a1)).toBe(false);
    expect(isChanged(s1, { a: 'a2', b: 'b' }, a1)).toBe(true);
    expect(isChanged(s1, { a: 'a', b: 'b2' }, a1)).toBe(false);
    expect(isChanged(s2, { a: 'a', b: 'b' }, a2)).toBe(false);
    expect(isChanged(s2, { a: 'a2', b: 'b' }, a2)).toBe(false);
    expect(isChanged(s2, { a: 'a', b: 'b2' }, a2)).toBe(true);
  });

  it('nested', () => {
    const proxyCache = new WeakMap();
    const s1 = { a: { b: 'b', c: 'c' } };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.a.b);
    const s2 = { a: s1.a }; // keep the reference
    const a2 = new WeakMap();
    const p2 = createProxy(s2, a2, proxyCache);
    noop(p2.a.c);
    expect(p1).not.toBe(p2);
    expect(p1.a).toBe(p2.a);
    expect(isChanged(s1, { a: { b: 'b', c: 'c' } }, a1)).toBe(false);
    expect(isChanged(s1, { a: { b: 'b2', c: 'c' } }, a1)).toBe(true);
    expect(isChanged(s1, { a: { b: 'b', c: 'c2' } }, a1)).toBe(false);
    expect(isChanged(s2, { a: { b: 'b', c: 'c' } }, a2)).toBe(false);
    expect(isChanged(s2, { a: { b: 'b2', c: 'c' } }, a2)).toBe(false);
    expect(isChanged(s2, { a: { b: 'b', c: 'c2' } }, a2)).toBe(true);
  });
});

describe('array spec', () => {
  it('length', () => {
    const s1 = [1, 2, 3];
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1);
    noop(p1.length);
    expect(isChanged(s1, [1, 2, 3], a1)).toBe(false);
    expect(isChanged(s1, [1, 2, 3, 4], a1)).toBe(true);
    expect(isChanged(s1, [1, 2], a1)).toBe(true);
    expect(isChanged(s1, [1, 2, 4], a1)).toBe(false);
  });

  it('forEach', () => {
    const s1 = [1, 2, 3];
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1);
    p1.forEach(noop);
    expect(isChanged(s1, [1, 2, 3], a1)).toBe(false);
    expect(isChanged(s1, [1, 2, 3, 4], a1)).toBe(true);
    expect(isChanged(s1, [1, 2], a1)).toBe(true);
    expect(isChanged(s1, [1, 2, 4], a1)).toBe(true);
  });

  it('for-of', () => {
    const s1 = [1, 2, 3];
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1);
    // eslint-disable-next-line no-restricted-syntax
    for (const x of p1) {
      noop(x);
    }
    expect(isChanged(s1, [1, 2, 3], a1)).toBe(false);
    expect(isChanged(s1, [1, 2, 3, 4], a1)).toBe(true);
    expect(isChanged(s1, [1, 2], a1)).toBe(true);
    expect(isChanged(s1, [1, 2, 4], a1)).toBe(true);
  });
});

describe('keys spec', () => {
  it('object keys', () => {
    const s1 = { a: { b: 'b' }, c: 'c' };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1);
    noop(Object.keys(p1));
    expect(isChanged(s1, { a: s1.a, c: 'c' }, a1)).toBe(false);
    expect(isChanged(s1, { a: { b: 'b' }, c: 'c' }, a1)).toBe(false);
    expect(isChanged(s1, { a: s1.a }, a1)).toBe(true);
    expect(isChanged(s1, { a: s1.a, c: 'c', d: 'd' }, a1)).toBe(true);
    expect(affectedToPathList(s1, a1)).toEqual([[':ownKeys']]);
  });

  it('for-in', () => {
    const s1 = { a: { b: 'b' }, c: 'c' };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1);
    // eslint-disable-next-line no-restricted-syntax, guard-for-in
    for (const k in p1) {
      noop(k);
    }
    expect(isChanged(s1, { a: s1.a, c: 'c' }, a1)).toBe(false);
    expect(isChanged(s1, { a: { b: 'b' }, c: 'c' }, a1)).toBe(false);
    expect(isChanged(s1, { a: s1.a }, a1)).toBe(true);
    expect(isChanged(s1, { a: s1.a, c: 'c', d: 'd' }, a1)).toBe(true);
  });

  it('single in operator', () => {
    const s1 = { a: { b: 'b' }, c: 'c' };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1);
    noop('a' in p1);
    expect(isChanged(s1, { a: s1.a, c: 'c' }, a1)).toBe(false);
    expect(isChanged(s1, { a: s1.a }, a1)).toBe(false);
    expect(isChanged(s1, { a: null }, a1)).toBe(false);
    expect(isChanged(s1, { c: 'c', d: 'd' }, a1)).toBe(true);
    expect(affectedToPathList(s1, a1)).toEqual([[':has(a)']]);
  });

  it('hasOwnProperty', () => {
    const s1 = { a: { b: 'b' }, c: 'c' };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1);
    noop(Object.prototype.hasOwnProperty.call(p1, 'a'));
    expect(isChanged(s1, { a: s1.a, c: 'c' }, a1)).toBe(false);
    expect(isChanged(s1, { a: s1.a }, a1)).toBe(false);
    expect(isChanged(s1, { a: null, c: 'c' }, a1)).toBe(false);
    expect(isChanged(s1, { c: 'c', d: 'd' }, a1)).toBe(true);
    expect(affectedToPathList(s1, a1)).toEqual([[':hasOwn(a)']]);
  });
});

describe('special objects spec', () => {
  it('object with cycles', () => {
    const proxyCache = new WeakMap();
    const s1: any = { a: 'a' };
    s1.self = s1;
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    const c1 = new WeakMap();
    noop(p1.self.a);
    expect(isChanged(s1, s1, a1, c1)).toBe(false);
    expect(isChanged(s1, { a: 'a', self: s1 }, a1, c1)).toBe(false);
    const s2: any = { a: 'a' };
    s2.self = s2;
    expect(isChanged(s1, s2, a1, c1)).toBe(false);
    const s3: any = { a: 'a2' };
    s3.self = s3;
    expect(isChanged(s1, s3, a1, c1)).toBe(true);
    expect(affectedToPathList(s1, a1)).toEqual([['a']]);
  });

  it('object with cycles 2', () => {
    const proxyCache = new WeakMap();
    const s1: any = { a: { b: 'b' } };
    s1.self = s1;
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    const c1 = new WeakMap();
    noop(p1.self.a);
    expect(isChanged(s1, s1, a1, c1)).toBe(false);
    expect(isChanged(s1, { a: s1.a, self: s1 }, a1, c1)).toBe(false);
    const s2: any = { a: { b: 'b' } };
    s2.self = s2;
    expect(isChanged(s1, s2, a1, c1)).toBe(true);
    expect(affectedToPathList(s1, a1)).toEqual([['a']]);
  });

  it('frozen object', () => {
    const proxyCache = new WeakMap();
    const s1: { a: { b: string }; c?: string } = { a: { b: 'b' }, c: 'c' };
    Object.freeze(s1);
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.a.b);
    expect(isChanged(s1, s1, a1)).toBe(false);
    expect(isChanged(s1, { a: { b: 'b' } }, a1)).toBe(false);
    expect(isChanged(s1, { a: { b: 'b2' } }, a1)).toBe(true);
    expect(() => {
      p1.a = { b: 'b3' };
    }).toThrow();
    expect(() => {
      delete p1.c;
    }).toThrow();
  });

  it('object with defineProperty (value only, implying non-configurable & non-writable)', () => {
    const proxyCache = new WeakMap();
    const s1: any = { c: 'c' };
    Object.defineProperty(s1, 'a', { value: { b: 'b' } });
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.a.b);
    expect(isChanged(s1, s1, a1)).toBe(false);
    expect(isChanged(s1, { a: { b: 'b' } }, a1)).toBe(false);
    expect(isChanged(s1, { a: { b: 'b2' } }, a1)).toBe(true);
    // Even though we've made a configurable copy, it is still non-writable, which is good b/c the
    // new value would go to the internal proxyFriendlyCopy copy we'd made.
    expect(() => {
      p1.a = { b: 'b2' };
    }).toThrowError("'set' on proxy: trap returned falsish for property 'a'");
    // And because it is a copy, it is readonly for all properties
    expect(() => {
      p1.c = 'c2';
    }).toThrowError("'set' on proxy: trap returned falsish for property 'c'");
  });

  it('object with defineProperty (value, non-configurable and not-writable)', () => {
    const proxyCache = new WeakMap();
    const s1: any = {};
    Object.defineProperty(s1, 'a', {
      value: { b: 'b' },
      configurable: false,
      writable: false,
    });
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.a.b);
  });

  it('object with defineProperty (value, non-configurable but writable)', () => {
    const proxyCache = new WeakMap();
    const s1: any = {};
    Object.defineProperty(s1, 'a', {
      value: { b: 'b' },
      configurable: false,
      writable: true,
    });
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.a.b);
  });

  it('object with defineProperty (vaule, configurable but not-writable)', () => {
    const proxyCache = new WeakMap();
    const s1: any = {};
    Object.defineProperty(s1, 'a', {
      value: { b: 'b' },
      configurable: true,
      writable: false,
    });
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.a.b);
  });

  it('object with defineProperty (getter, non-configurable)', () => {
    const proxyCache = new WeakMap();
    const s1: any = {};
    Object.defineProperty(s1, 'a', {
      get() {
        return { b: 'b' };
      },
      configurable: false,
    });
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.a.b);
  });
});

describe('builtin objects spec', () => {
  // we can't track builtin objects

  it('boolean', () => {
    /* eslint-disable no-new-wrappers */
    const proxyCache = new WeakMap();
    const s1 = { a: new Boolean(false) };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.a.valueOf());
    expect(isChanged(s1, s1, a1)).toBe(false);
    expect(isChanged(s1, { a: new Boolean(false) }, a1)).toBe(true);
    /* eslint-enable no-new-wrappers */
  });

  it('error', () => {
    const proxyCache = new WeakMap();
    const s1 = { a: new Error('e') };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.a.message);
    expect(isChanged(s1, s1, a1)).toBe(false);
    expect(isChanged(s1, { a: new Error('e') }, a1)).toBe(true);
  });

  it('date', () => {
    const proxyCache = new WeakMap();
    const s1 = { a: new Date('2019-05-11T12:22:29.293Z') };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.a.getTime());
    expect(isChanged(s1, s1, a1)).toBe(false);
    expect(isChanged(s1, { a: new Date('2019-05-11T12:22:29.293Z') }, a1)).toBe(
      true,
    );
  });

  it('regexp', () => {
    const proxyCache = new WeakMap();
    const s1 = { a: /a/ };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.a.test('a'));
    expect(isChanged(s1, s1, a1)).toBe(false);
    expect(isChanged(s1, { a: /a/ }, a1)).toBe(true);
  });

  it('map', () => {
    const proxyCache = new WeakMap();
    const s1 = { a: new Map() };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.a.entries());
    expect(isChanged(s1, s1, a1)).toBe(false);
    expect(isChanged(s1, { a: new Map() }, a1)).toBe(true);
  });

  it('typed array', () => {
    const proxyCache = new WeakMap();
    const s1 = { a: Int8Array.from([1]) };
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.a[0]);
    expect(isChanged(s1, s1, a1)).toBe(false);
    expect(isChanged(s1, { a: Int8Array.from([1]) }, a1)).toBe(true);
  });
});
