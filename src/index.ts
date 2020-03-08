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

// check if obj is a plain object or an array
const isPlainObject = <T>(obj: T): obj is T extends object ? T : never => {
  try {
    const proto = Object.getPrototypeOf(obj);
    return proto === Object.prototype || proto === Array.prototype;
  } catch (e) {
    return false;
  }
};

// copy obj if frozen
const unfreeze = (obj: object) => {
  if (!Object.isFrozen(obj)) return obj;
  if (Array.isArray(obj)) {
    return Array.from(obj);
  }
  return Object.assign({}, obj);
};

type Affected = WeakMap<object, Set<string | number | symbol>>;
type ProxyCache<T extends object> = WeakMap<object, ProxyHandler<T>>;
type ProxyHandler<T extends object> = {
  [PROXY_PROPERTY]: T;
  [PROXY_CACHE_PROPERTY]?: ProxyCache<object>;
  [AFFECTED_PROPERTY]: Affected;
  [TRACK_OBJECT_PROPERTY]: boolean;
  [ORIGINAL_OBJECT_PROPERTY]: T;
  [RECORD_USAGE_PROPERTY](key: string | number | symbol): void;
  [RECORD_OBJECT_AS_USED_PROPERTY](): void;
  get(target: T, key: string | number | symbol): unknown;
  has(target: T, key: string | number | symbol): boolean;
  ownKeys(target: T): (string | number | symbol)[];
};

const createProxyHandler = <T extends object>() => {
  const handler: ProxyHandler<T> = {
    [RECORD_USAGE_PROPERTY](key) {
      if (this[TRACK_OBJECT_PROPERTY]) return;
      let used = this[AFFECTED_PROPERTY].get(this[ORIGINAL_OBJECT_PROPERTY]);
      if (!used) {
        used = new Set();
        this[AFFECTED_PROPERTY].set(this[ORIGINAL_OBJECT_PROPERTY], used);
      }
      used.add(key);
    },
    [RECORD_OBJECT_AS_USED_PROPERTY]() {
      this[TRACK_OBJECT_PROPERTY] = true;
      this[AFFECTED_PROPERTY].delete(this[ORIGINAL_OBJECT_PROPERTY]);
    },
    get(target, key) {
      if (key === GET_ORIGINAL_SYMBOL) {
        return this[ORIGINAL_OBJECT_PROPERTY];
      }
      this[RECORD_USAGE_PROPERTY](key);
      return createDeepProxy(
        (target as any)[key],
        this[AFFECTED_PROPERTY],
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
  } as ProxyHandler<T>; // XXX wrong assertion, better way?
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
  affected: Affected,
  proxyCache?: WeakMap<object, unknown>,
): T => {
  if (!isPlainObject(obj)) return obj;
  const origObj = (
    obj as { [GET_ORIGINAL_SYMBOL]?: typeof obj }
  )[GET_ORIGINAL_SYMBOL]; // unwrap proxy
  const target = origObj || obj;
  let proxyHandler: ProxyHandler<typeof target> | undefined = (
    proxyCache && (proxyCache as ProxyCache<typeof target>).get(target)
  );
  if (!proxyHandler) {
    proxyHandler = createProxyHandler<T extends object ? T : never>();
    proxyHandler[PROXY_PROPERTY] = new Proxy(unfreeze(target), proxyHandler) as typeof target;
    proxyHandler[ORIGINAL_OBJECT_PROPERTY] = target;
    proxyHandler[TRACK_OBJECT_PROPERTY] = false; // for trackMemo
    if (proxyCache) {
      proxyCache.set(target, proxyHandler);
    }
  }
  proxyHandler[AFFECTED_PROPERTY] = affected;
  proxyHandler[PROXY_CACHE_PROPERTY] = proxyCache as ProxyCache<object>;
  return proxyHandler[PROXY_PROPERTY];
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
  [CHANGED_PROPERTY]?: boolean;
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
  affected: Affected,
  cache?: WeakMap<object, unknown>,
  mode = 0,
): boolean | undefined => {
  if (origObj === nextObj && (mode & MODE_IGNORE_REF_EQUALITY) === 0) return false;
  if (typeof origObj !== 'object' || origObj === null) return true;
  if (typeof nextObj !== 'object' || nextObj === null) return true;
  const used = affected.get(origObj);
  if (!used) return (mode & MODE_ASSUME_UNCHANGED_IF_UNAFFECTED) === 0;
  if (cache && (mode & MODE_IGNORE_REF_EQUALITY) === 0) {
    const hit = (cache as DeepChangedCache).get(origObj);
    if (hit && hit[NEXT_OBJECT_PROPERTY] === nextObj) {
      return hit[CHANGED_PROPERTY];
    }
    // for object with cycles (CHANGED_PROPERTY is `undefined`)
    cache.set(origObj, { [NEXT_OBJECT_PROPERTY]: nextObj });
  }
  let changed = null;
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
  if (isPlainObject(obj)) {
    return TRACK_MEMO_SYMBOL in obj;
  }
  return false;
};

// get original object from proxy
export const getUntrackedObject = <T>(obj: T): T | null => {
  if (isPlainObject(obj)) {
    return (obj as { [GET_ORIGINAL_SYMBOL]?: T })[GET_ORIGINAL_SYMBOL] || null;
  }
  return null;
};
