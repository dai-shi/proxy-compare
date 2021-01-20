// symbols
const OWN_KEYS_SYMBOL = Symbol();
const TRACK_MEMO_SYMBOL = Symbol();
const GET_ORIGINAL_SYMBOL = Symbol();

// properties
const AFFECTED_PROPERTY = 'a';
const FROZEN_PROPERTY = 'f';
const PROXY_PROPERTY = 'p';
const PROXY_CACHE_PROPERTY = 'c';
const NEXT_OBJECT_PROPERTY = 'n';
const CHANGED_PROPERTY = 'g';

// get object prototype
const getProto = Object.getPrototypeOf;

const objectsToTrack = new WeakMap<object, boolean>();

// check if obj is a plain object or an array
const isObjectToTrack = <T>(obj: T): obj is T extends object ? T : never => (
  obj && (objectsToTrack.has(obj as unknown as object)
    ? objectsToTrack.get(obj as unknown as object) as boolean
    : (getProto(obj) === Object.prototype || getProto(obj) === Array.prototype)
  )
);

// check if it is object
const isObject = (x: unknown): x is object => (
  typeof x === 'object' && x !== null
);

// check if frozen
const isFrozen = (obj: object) => (
  Object.isFrozen(obj) || (
    // Object.isFrozen() doesn't detect non-writable properties
    // See: https://github.com/dai-shi/proxy-compare/pull/8
    Object.values(Object.getOwnPropertyDescriptors(obj)).some(
      (descriptor) => !descriptor.writable,
    )
  )
);

// copy frozen object
const unfreeze = (obj: object) => {
  if (Array.isArray(obj)) {
    // Arrays need a special way to copy
    return Array.from(obj);
  }
  // For non-array objects, we create a new object keeping the prototype
  // with changing all configurable options (otherwise, proxies will complain)
  const descriptors = Object.getOwnPropertyDescriptors(obj);
  Object.values(descriptors).forEach((desc) => { desc.configurable = true; });
  return Object.create(getProto(obj), descriptors);
};

type Affected = WeakMap<object, Set<string | number | symbol>>;
type ProxyCache<T extends object> = WeakMap<object, ProxyHandler<T>>;
type ProxyHandler<T extends object> = {
  [FROZEN_PROPERTY]: boolean;
  [PROXY_PROPERTY]?: T;
  [PROXY_CACHE_PROPERTY]?: ProxyCache<object>;
  [AFFECTED_PROPERTY]?: Affected;
  get(target: T, key: string | number | symbol): unknown;
  has(target: T, key: string | number | symbol): boolean;
  ownKeys(target: T): (string | number | symbol)[];
  set?(target: T, key: string | number | symbol, value: unknown): boolean;
  deleteProperty?(target: T, key: string | number | symbol): boolean;
};

const createProxyHandler = <T extends object>(origObj: T, frozen: boolean) => {
  let trackObject = false; // for trackMemo
  const recordUsage = (h: ProxyHandler<T>, key: string | number | symbol) => {
    if (!trackObject) {
      let used = (h[AFFECTED_PROPERTY] as Affected).get(origObj);
      if (!used) {
        used = new Set();
        (h[AFFECTED_PROPERTY] as Affected).set(origObj, used);
      }
      used.add(key);
    }
  };
  const recordObjectAsUsed = (h: ProxyHandler<T>) => {
    trackObject = true;
    (h[AFFECTED_PROPERTY] as Affected).delete(origObj);
  };
  const handler: ProxyHandler<T> = {
    [FROZEN_PROPERTY]: frozen,
    get(target, key) {
      if (key === GET_ORIGINAL_SYMBOL) {
        return origObj;
      }
      recordUsage(this, key);
      return createDeepProxy(
        (target as any)[key],
        (this[AFFECTED_PROPERTY] as Affected),
        this[PROXY_CACHE_PROPERTY],
      );
    },
    has(target, key) {
      if (key === TRACK_MEMO_SYMBOL) {
        recordObjectAsUsed(this);
        return true;
      }
      // LIMITATION:
      // We simply record the same as get.
      // This means { a: {} } and { a: {} } is detected as changed,
      // if 'a' in obj is handled.
      recordUsage(this, key);
      return key in target;
    },
    ownKeys(target) {
      recordUsage(this, OWN_KEYS_SYMBOL);
      return Reflect.ownKeys(target);
    },
  };
  if (frozen) {
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
  const frozen = isFrozen(target);
  let proxyHandler: ProxyHandler<typeof target> | undefined = (
    proxyCache && (proxyCache as ProxyCache<typeof target>).get(target)
  );
  if (!proxyHandler || proxyHandler[FROZEN_PROPERTY] !== frozen) {
    proxyHandler = createProxyHandler<T extends object ? T : never>(target, frozen);
    proxyHandler[PROXY_PROPERTY] = new Proxy(
      frozen ? unfreeze(target) : target,
      proxyHandler,
    ) as typeof target;
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

// mark object to track or not (even if it is not plain)
export const markToTrack = (obj: object, mark = true) => {
  objectsToTrack.set(obj, mark);
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
