import { describe, expect, it } from 'vitest';
import { affectedToPathList, createProxy, markToTrack } from 'proxy-compare';

const noop = (_arg: unknown) => {
  // do nothing
};

describe('mutation spec (this usage is not officially supported)', () => {
  it('object getters & setters', () => {
    const obj = {
      count: 1,
      get doubled() {
        return this.count;
      },
      set doubled(v) {
        // XXX mutation usage is not supported by proxy-compare
        this.count = v / 2;
      },
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
    class Counter {
      count = 1;

      get doubled() {
        return this.count;
      }

      set doubled(v) {
        // XXX mutation usage is not supported by proxy-compare
        this.count = v / 2;
      }
    }
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
