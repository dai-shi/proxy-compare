// symbols
const OWN_KEYS_SYMBOL = Symbol();
const TRACK_MEMO_SYMBOL = Symbol();
const GET_ORIGINAL_SYMBOL = Symbol();

// properties
const TRACK_OBJECT_PROPERTY = 't';
const AFFECTED_PROPERTY = 'a';
const RECORD_USAGE_PROPERTY = 'r';
const RECORD_OBJECT_AS_USED_PROPERTY = 'u';
const ORIGINAL_OBJECT_PROPERTY = 'o';
const PROXY_PROPERTY = 'p';
const PROXY_CACHE_PROPERTY = 'c';
const NEXT_OBJECT_PROPERTY = 'n';
const CHANGED_PROPERTY = 'g';

// get object prototype
const getProto = Object.getPrototypeOf;

const objectsToTrack = new WeakMap<object, boolean>();

// check if obj is a plain object or an array
const isObjectToTrack = <T>(obj: T): obj is T extends object ? T : never => (
  obj && (
    getProto(obj) === Object.prototype
    || getProto(obj) === Array.prototype
    || !!objectsToTrack.get(obj as unknown as object)
  )
);

// check if it is object
const isObject = (x: unknown): x is object => (
  typeof x === 'object' && x !== null
);

const getPropDescs = (obj: object) => {
  const descriptors = Object.getOwnPropertyDescriptors(obj);
  Object.values(descriptors).forEach((descriptor) => {
    descriptor.configurable = true;
  });
  return descriptors;
};

// copy obj if frozen
const unfreeze = (obj: object) => (
  !Object.isFrozen(obj) ? obj
    : Array.isArray(obj) ? Array.from(obj)
      : /* otherwise */ Object.create(getProto(obj), getPropDescs(obj))
);

type Affected = WeakMap<object, Set<string | number | symbol>>;
type ProxyCache<T extends object> = WeakMap<object, ProxyHandler<T>>;
type ProxyHandler<T extends object> = {
  [PROXY_PROPERTY]?: T;
  [PROXY_CACHE_PROPERTY]?: ProxyCache<object>;
  [AFFECTED_PROPERTY]?: Affected;
  [TRACK_OBJECT_PROPERTY]: boolean;
  [ORIGINAL_OBJECT_PROPERTY]: T;
  [RECORD_USAGE_PROPERTY](key: string | number | symbol): void;
  [RECORD_OBJECT_AS_USED_PROPERTY](): void;
  get(target: T, key: string | number | symbol): unknown;
  has(target: T, key: string | number | symbol): boolean;
  ownKeys(target: T): (string | number | symbol)[];
  set?(target: T, key: string | number | symbol, value: unknown): boolean;
  deleteProperty?(target: T, key: string | number | symbol): boolean;
};

const createProxyHandler = <T extends object>(origObj: T) => {
  const handler: ProxyHandler<T> = {
    [ORIGINAL_OBJECT_PROPERTY]: origObj,
    [TRACK_OBJECT_PROPERTY]: false, // for trackMemo
    [RECORD_USAGE_PROPERTY](key) {
      if (!this[TRACK_OBJECT_PROPERTY]) {
        let used = (this[AFFECTED_PROPERTY] as Affected).get(this[ORIGINAL_OBJECT_PROPERTY]);
        if (!used) {
          used = new Set();
          (this[AFFECTED_PROPERTY] as Affected).set(this[ORIGINAL_OBJECT_PROPERTY], used);
        }
        used.add(key);
      }
    },
    [RECORD_OBJECT_AS_USED_PROPERTY]() {
      this[TRACK_OBJECT_PROPERTY] = true;
      (this[AFFECTED_PROPERTY] as Affected).delete(this[ORIGINAL_OBJECT_PROPERTY]);
    },
    get(target, key) {
      if (key === GET_ORIGINAL_SYMBOL) {
        return this[ORIGINAL_OBJECT_PROPERTY];
      }
      this[RECORD_USAGE_PROPERTY](key);
      return createDeepProxy(
        (target as any)[key],
        (this[AFFECTED_PROPERTY] as Affected),
        this[PROXY_CACHE_PROPERTY],
      );
    },
    has(target, key) {
      if (key === TRACK_MEMO_SYMBOL) {
        this[RECORD_OBJECT_AS_USED_PROPERTY]();
        return true;
      }
      // LIMITATION:
      // We simply record the same as get.
      // This means { a: {} } and { a: {} } is detected as changed,
      // if 'a' in obj is handled.
      this[RECORD_USAGE_PROPERTY](key);
      return key in target;
    },
    ownKeys(target) {
      this[RECORD_USAGE_PROPERTY](OWN_KEYS_SYMBOL);
      return Reflect.ownKeys(target);
    },
  };
  if (Object.isFrozen(origObj)) {
    handler.set = handler.deleteProperty = () => false;
  }
  return handler;
};

/**
 * create a proxy
 *
 * It will recursively create a proxy upon access.
 *
 * @example
 * import { createDeepProxy } from 'proxy-compare';
 *
 * const obj = ...;
 * const affected = new WeakMap();
 * const proxy = createDeepProxy(obj, affected);
 */
export const createDeepProxy = <T>(
  obj: T,
  affected: WeakMap<object, unknown>,
  proxyCache?: WeakMap<object, unknown>,
): T => {
  if (!isObjectToTrack(obj)) return obj;
  const origObj = (
    obj as { [GET_ORIGINAL_SYMBOL]?: typeof obj }
  )[GET_ORIGINAL_SYMBOL]; // unwrap proxy
  const target = origObj || obj;
  let proxyHandler: ProxyHandler<typeof target> | undefined = (
    proxyCache && (proxyCache as ProxyCache<typeof target>).get(target)
  );
  if (!proxyHandler) {
    proxyHandler = createProxyHandler<T extends object ? T : never>(target);
    proxyHandler[PROXY_PROPERTY] = new Proxy(unfreeze(target), proxyHandler) as typeof target;
    if (proxyCache) {
      proxyCache.set(target, proxyHandler);
    }
  }
  proxyHandler[AFFECTED_PROPERTY] = affected as Affected;
  proxyHandler[PROXY_CACHE_PROPERTY] = proxyCache as ProxyCache<object> | undefined;
  return proxyHandler[PROXY_PROPERTY] as typeof target;
};

const isOwnKeysChanged = (origObj: object, nextObj: object) => {
  const origKeys = Reflect.ownKeys(origObj);
  const nextKeys = Reflect.ownKeys(nextObj);
  return origKeys.length !== nextKeys.length
    || origKeys.some((k, i) => k !== nextKeys[i]);
};

export const MODE_ASSUME_UNCHANGED_IF_UNAFFECTED = /*   */ 0b00001;
export const MODE_IGNORE_REF_EQUALITY = /*              */ 0b00010;

const IN_DEEP_SHIFT = 2;
export const MODE_ASSUME_UNCHANGED_IF_UNAFFECTED_IN_DEEP = (
  MODE_ASSUME_UNCHANGED_IF_UNAFFECTED << IN_DEEP_SHIFT
);
export const MODE_IGNORE_REF_EQUALITY_IN_DEEP = (
  MODE_IGNORE_REF_EQUALITY << IN_DEEP_SHIFT
);

type DeepChangedCache = WeakMap<object, {
  [NEXT_OBJECT_PROPERTY]: object;
  [CHANGED_PROPERTY]: boolean;
}>;

/**
 * compare two object
 *
 * It will compare only with affected object properties
 *
 * @example
 * import { isDeepChanged } from 'proxy-compare';
 *
 * const objToCompare = ...;
 * const changed = isDeepChanged(obj, objToCompare, affected);
 */
export const isDeepChanged = (
  origObj: unknown,
  nextObj: unknown,
  affected: WeakMap<object, unknown>,
  cache?: WeakMap<object, unknown>,
  mode = 0,
): boolean => {
  if (Object.is(origObj, nextObj) && (
    !isObject(origObj) || (mode & MODE_IGNORE_REF_EQUALITY) === 0)
  ) {
    return false;
  }
  if (!isObject(origObj) || !isObject(nextObj)) return true;
  const used = (affected as Affected).get(origObj);
  if (!used) return (mode & MODE_ASSUME_UNCHANGED_IF_UNAFFECTED) === 0;
  if (cache && (mode & MODE_IGNORE_REF_EQUALITY) === 0) {
    const hit = (cache as DeepChangedCache).get(origObj);
    if (hit && hit[NEXT_OBJECT_PROPERTY] === nextObj) {
      return hit[CHANGED_PROPERTY];
    }
    // for object with cycles
    (cache as DeepChangedCache).set(origObj, {
      [NEXT_OBJECT_PROPERTY]: nextObj,
      [CHANGED_PROPERTY]: false,
    });
  }
  let changed: boolean | null = null;
  // eslint-disable-next-line no-restricted-syntax
  for (const key of used) {
    const c = key === OWN_KEYS_SYMBOL ? isOwnKeysChanged(origObj, nextObj)
      : isDeepChanged(
        (origObj as any)[key],
        (nextObj as any)[key],
        affected,
        cache,
        ((mode >>> IN_DEEP_SHIFT) << IN_DEEP_SHIFT) | (mode >>> IN_DEEP_SHIFT),
      );
    if (c === true || c === false) changed = c;
    if (changed) break;
  }
  if (changed === null) changed = (mode & MODE_ASSUME_UNCHANGED_IF_UNAFFECTED) === 0;
  if (cache && (mode & MODE_IGNORE_REF_EQUALITY) === 0) {
    cache.set(origObj, {
      [NEXT_OBJECT_PROPERTY]: nextObj,
      [CHANGED_PROPERTY]: changed,
    });
  }
  return changed;
};

// explicitly track object with memo
export const trackMemo = (obj: unknown) => {
  if (isObjectToTrack(obj)) {
    return TRACK_MEMO_SYMBOL in obj;
  }
  return false;
};

// get original object from proxy
export const getUntrackedObject = <T>(obj: T): T | null => {
  if (isObjectToTrack(obj)) {
    return (obj as { [GET_ORIGINAL_SYMBOL]?: T })[GET_ORIGINAL_SYMBOL] || null;
  }
  return null;
};

// mark object to track (even if it is not plain)
export const markToTrack = (obj: object) => {
  objectsToTrack.set(obj, true);
};

// convert affected to path list
export const affectedToPathList = (
  obj: unknown,
  affected: WeakMap<object, unknown>,
) => {
  const list: (string | number | symbol)[][] = [];
  const walk = (x: unknown, path?: (string | number | symbol)[]) => {
    const used = (affected as Affected).get(x as object);
    if (used) {
      used.forEach((key) => {
        walk((x as any)[key], path ? [...path, key] : [key]);
      });
    } else if (path) {
      list.push(path);
    }
  };
  walk(obj);
  return list;
};
