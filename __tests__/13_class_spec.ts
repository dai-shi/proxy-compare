import {
  affectedToPathList,
  createProxy,
  isChanged,
  markToTrack,
} from '../src/index';

const noop = (_arg: unknown) => {
  // do nothing
};

describe('class spec', () => {
  class Counter {
    count = 1;

    get doubled() { return this.count; }

    set doubled(v) { this.count = v / 2; }
  }

  it('normal', () => {
    const proxyCache = new WeakMap();
    const s1 = new Counter();
    markToTrack(s1);
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.count);
    expect(isChanged(s1, s1, a1)).toBe(false);
    expect(isChanged(s1, { count: 1 }, a1)).toBe(false);
    expect(isChanged(s1, { count: 2 }, a1)).toBe(true);
    expect(Object.getPrototypeOf(p1) === Counter.prototype).toBe(true);
  });

  it('frozen', () => {
    const proxyCache = new WeakMap();
    const s1 = new Counter();
    Object.freeze(s1);
    markToTrack(s1);
    const a1 = new WeakMap();
    const p1 = createProxy(s1, a1, proxyCache);
    noop(p1.count);
    expect(isChanged(s1, s1, a1)).toBe(false);
    expect(isChanged(s1, { count: 1 }, a1)).toBe(false);
    expect(isChanged(s1, { count: 2 }, a1)).toBe(true);
    expect(Object.getPrototypeOf(p1) === Counter.prototype).toBe(true);
  });

  it('object getters & setters', () => {
    const obj = {
      count: 1,
      get doubled() { return this.count; },
      set doubled(v) { this.count = v / 2; },
    };
    const proxyCache = new WeakMap();
    const a1 = new WeakMap();
    const p1 = createProxy(obj, a1, proxyCache);

    // proxy observers the getter call
    noop(p1.doubled);
    expect(affectedToPathList(p1, a1)).toEqual([['doubled']]);

    // setting proxy affects obj
    p1.doubled = 4;
    expect(obj.count).toBe(2);

    // setting obj affects proxy
    obj.doubled = 8;
    expect(p1.count).toBe(4);

    expect(affectedToPathList(p1, a1)).toEqual([
      [':hasOwn(count)'],
      ['doubled'],
      ['count'],
    ]);
  });

  it('class getters & setters', () => {
    const obj = new Counter();
    markToTrack(obj);
    const proxyCache = new WeakMap();
    const a1 = new WeakMap();
    const p1 = createProxy(obj, a1, proxyCache);

    // proxy observers the getter call
    noop(p1.doubled);
    expect(affectedToPathList(p1, a1)).toEqual([['doubled']]);

    // setting proxy affects obj
    p1.doubled = 4;
    expect(obj.count).toBe(2);

    // setting obj affects proxy
    obj.doubled = 8;
    expect(p1.count).toBe(4);

    expect(affectedToPathList(p1, a1)).toEqual([
      [':hasOwn(count)'],
      ['doubled'],
      ['count'],
    ]);
  });
});
