// symbols
const TRACK_MEMO_SYMBOL = Symbol();
const GET_ORIGINAL_SYMBOL = Symbol();

// properties
const ACCESSED_PROPERTY = 'a';
const FROZEN_PROPERTY = 'f';
const PROXY_PROPERTY = 'p';
const PROXY_CACHE_PROPERTY = 'c';
const NEXT_OBJECT_PROPERTY = 'n';
const CHANGED_PROPERTY = 'g';
const HAS_KEY_PROPERTY = 'h';
const ALL_OWN_KEYS_PROPERTY = 'w';
const HAS_OWN_KEY_PROPERTY = 'o';
const KEYS_PROPERTY = 'k';

// function to create a new bare proxy
let newProxy = <T extends object>(
  target: T,
  handler: ProxyHandler<T>,
) => new Proxy(target, handler);

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
const unfrozenCache = new WeakMap<object, object>();
const unfreeze = <T extends object>(obj: T): T => {
  let unfrozen = unfrozenCache.get(obj);
  if (!unfrozen) {
    if (Array.isArray(obj)) {
      // Arrays need a special way to copy
      unfrozen = Array.from(obj);
    } else {
      // For non-array objects, we create a new object keeping the prototype
      // with changing all configurable options (otherwise, proxies will complain)
      const descriptors = Object.getOwnPropertyDescriptors(obj);
      Object.values(descriptors).forEach((desc) => { desc.configurable = true; });
      unfrozen = Object.create(getProto(obj), descriptors);
    }
    unfrozenCache.set(obj, unfrozen as object);
  }
  return unfrozen as T;
};

type HasKeySet = Set<string | symbol>
type HasOwnKeySet = Set<string | symbol>
type KeysSet = Set<string | symbol>
type Used = {
  [HAS_KEY_PROPERTY]?: HasKeySet;
  [ALL_OWN_KEYS_PROPERTY]?: true;
  [HAS_OWN_KEY_PROPERTY]?: HasOwnKeySet;
  [KEYS_PROPERTY]?: KeysSet;
};
type Accessed = WeakMap<object, Used>;
type ProxyHandlerState<T extends object> = {
  readonly [FROZEN_PROPERTY]: boolean;
  [PROXY_PROPERTY]?: T;
  [PROXY_CACHE_PROPERTY]?: ProxyCache<object> | undefined;
  [ACCESSED_PROPERTY]?: Accessed;
}
type ProxyCache<T extends object> = WeakMap<
  object,
  readonly [ProxyHandler<T>, ProxyHandlerState<T>]
>;

const createProxyHandler = <T extends object>(origObj: T, frozen: boolean) => {
  const state: ProxyHandlerState<T> = {
    [FROZEN_PROPERTY]: frozen,
  };
  let trackObject = false; // for trackMemo
  const recordUsage = (
    type:
      | typeof HAS_KEY_PROPERTY
      | typeof ALL_OWN_KEYS_PROPERTY
      | typeof HAS_OWN_KEY_PROPERTY
      | typeof KEYS_PROPERTY,
    key?: string | symbol,
  ) => {
    if (!trackObject) {
      let used = (state[ACCESSED_PROPERTY] as Accessed).get(origObj);
      if (!used) {
        used = {};
        (state[ACCESSED_PROPERTY] as Accessed).set(origObj, used);
      }
      if (type === ALL_OWN_KEYS_PROPERTY) {
        used[ALL_OWN_KEYS_PROPERTY] = true;
      } else {
        let set = used[type];
        if (!set) {
          set = new Set();
          used[type] = set;
        }
        set.add(key as string | symbol);
      }
    }
  };
  const recordObjectAsUsed = () => {
    trackObject = true;
    (state[ACCESSED_PROPERTY] as Accessed).delete(origObj);
  };
  const handler: ProxyHandler<T> = {
    get(target, key) {
      if (key === GET_ORIGINAL_SYMBOL) {
        return origObj;
      }
      recordUsage(KEYS_PROPERTY, key);
      return createProxy(
        Reflect.get(target, key),
        (state[ACCESSED_PROPERTY] as Accessed),
        state[PROXY_CACHE_PROPERTY],
      );
    },
    has(target, key) {
      if (key === TRACK_MEMO_SYMBOL) {
        recordObjectAsUsed();
        return true;
      }
      recordUsage(HAS_KEY_PROPERTY, key);
      return Reflect.has(target, key);
    },
    getOwnPropertyDescriptor(target, key) {
      recordUsage(HAS_OWN_KEY_PROPERTY, key);
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    ownKeys(target) {
      recordUsage(ALL_OWN_KEYS_PROPERTY);
      return Reflect.ownKeys(target);
    },
  };
  if (frozen) {
    handler.set = handler.deleteProperty = () => false;
  }
  return [handler, state] as const;
};

const getOriginalObject = <T extends object>(obj: T) => (
  // unwrap proxy
  (obj as { [GET_ORIGINAL_SYMBOL]?: typeof obj })[GET_ORIGINAL_SYMBOL]
  // otherwise
  || obj
);

/**
 * Create a proxy.
 *
 * This function will create a proxy at top level and proxy nested objects as you access them,
 * in order to keep track of which properties were accessed via get/has proxy handlers:
 *
 * NOTE: Printing of WeakMap is hard to inspect and not very readable; for this you can use
 * `getPathList`.
 *
 * @param {object} obj - Object that will be wrapped on the proxy.
 * @param {WeakMap<object, unknown>} accessed -
 * WeakMap that will hold the tracking of which properties in the proxied object were accessed.
 * @param {WeakMap<object, unknown>} [proxyCache] -
 * WeakMap that will help keep referential identity for proxies.
 * @returns {Proxy<object>} - Object wrapped in a proxy.
 *
 * @example
 * import { createProxy } from 'proxy-compare';
 *
 * const nested = { e: "3" }
 * const original = { a: "1", c: "2", d: nested };
 * const accessed = new WeakMap();
 * const proxy = createProxy(original, accessed);
 *
 * proxy.a // Marks `a` as accessed and returns "1"
 * // The usage is recorded in accessed:
 * // { original: Set("a") }
 *
 * proxy.d // marks "d" as accessed and returns nested wrapped in its own tracking proxy
 * // The usage is recorded in accessed:
 * // { original: Set("a", "d") }
 *
 * proxy.d.e // marks "d" as accessed on `nested` and returns "3"
 * // The usage is recorded in accessed:
 * // { parent: Set("a", "d"), nested: Set("e") }
 */
export const createProxy = <T>(
  obj: T,
  accessed: WeakMap<object, unknown>,
  proxyCache?: WeakMap<object, unknown>,
): T => {
  if (!isObjectToTrack(obj)) return obj;
  const target = getOriginalObject(obj);
  const frozen = isFrozen(target);
  let handlerAndState = (
    proxyCache && (proxyCache as ProxyCache<typeof target>).get(target)
  );
  if (!handlerAndState || handlerAndState[1][FROZEN_PROPERTY] !== frozen) {
    handlerAndState = createProxyHandler<typeof target>(target, frozen);
    handlerAndState[1][PROXY_PROPERTY] = newProxy(
      frozen ? unfreeze(target) : target,
      handlerAndState[0],
    );
    if (proxyCache) {
      proxyCache.set(target, handlerAndState);
    }
  }
  handlerAndState[1][ACCESSED_PROPERTY] = accessed as Accessed;
  handlerAndState[1][PROXY_CACHE_PROPERTY] = proxyCache as ProxyCache<object> | undefined;
  return handlerAndState[1][PROXY_PROPERTY] as typeof target;
};

const isAllOwnKeysChanged = (prevObj: object, nextObj: object) => {
  const prevKeys = Reflect.ownKeys(prevObj);
  const nextKeys = Reflect.ownKeys(nextObj);
  return prevKeys.length !== nextKeys.length
    || prevKeys.some((k, i) => k !== nextKeys[i]);
};

type ChangedCache = WeakMap<object, {
  [NEXT_OBJECT_PROPERTY]: object;
  [CHANGED_PROPERTY]: boolean;
}>;

/**
 * Compare changes on objects.
 *
 * This will compare the accessed properties on tracked objects inside the proxy
 * to check if there were any changes made to it,
 * by default if no property was accessed on the proxy it will attempt to do a
 * reference equality check for the objects provided (Object.is(a, b)). If you access a property
 * on the proxy, then isChanged will only compare the accessed properties.
 *
 * @param {object} prevObj - The previous object to compare.
 * @param {object} nextObj - The next object to compare with the previous one.
 * @param {WeakMap<object, unknown>} accessed -
 * WeakMap that holds the tracking of which properties in the proxied object were accessed.
 * @param {WeakMap<object, unknown>} [cache] -
 * WeakMap that holds a cache of the comparisons for better performance with repetitive comparisons,
 * and to avoid infinite loop with circular structures.
 * @returns {boolean} - Boolean indicating if any accessed properties on the object (or nested
 * fields that were accessed on tracked child objects) have changed.
 *
 * @example
 * import { createProxy, isChanged } from 'proxy-compare';
 *
 * const obj = { a: "1", c: "2", d: { e: "3" } };
 * const accessed = new WeakMap();
 *
 * const proxy = createProxy(obj, accessed);
 *
 * proxy.a
 *
 * isChanged(obj, { a: "1" }, accessed) // false
 *
 * proxy.a = "2"
 *
 * isChanged(obj, { a: "1" }, accessed) // true
 */

export const isChanged = (
  prevObj: unknown,
  nextObj: unknown,
  accessed: WeakMap<object, unknown>,
  cache?: WeakMap<object, unknown>,
): boolean => {
  if (Object.is(prevObj, nextObj)) {
    return false;
  }
  if (!isObject(prevObj) || !isObject(nextObj)) return true;
  const used = (accessed as Accessed).get(getOriginalObject(prevObj));
  if (!used) return true;
  if (cache) {
    const hit = (cache as ChangedCache).get(prevObj);
    if (hit && hit[NEXT_OBJECT_PROPERTY] === nextObj) {
      return hit[CHANGED_PROPERTY];
    }
    // for object with cycles
    (cache as ChangedCache).set(prevObj, {
      [NEXT_OBJECT_PROPERTY]: nextObj,
      [CHANGED_PROPERTY]: false,
    });
  }
  let changed: boolean | null = null;
  try {
    for (const key of used[HAS_KEY_PROPERTY] || []) {
      changed = Reflect.has(prevObj, key) !== Reflect.has(nextObj, key);
      if (changed) return changed;
    }
    if (used[ALL_OWN_KEYS_PROPERTY] === true) {
      changed = isAllOwnKeysChanged(prevObj, nextObj);
      if (changed) return changed;
    } else {
      for (const key of used[HAS_OWN_KEY_PROPERTY] || []) {
        const hasPrev = !!Reflect.getOwnPropertyDescriptor(prevObj, key);
        const hasNext = !!Reflect.getOwnPropertyDescriptor(nextObj, key);
        changed = hasPrev !== hasNext;
        if (changed) return changed;
      }
    }
    for (const key of used[KEYS_PROPERTY] || []) {
      changed = isChanged(
        (prevObj as any)[key],
        (nextObj as any)[key],
        accessed,
        cache,
      );
      if (changed) return changed;
    }
    if (changed === null) changed = true;
    return changed;
  } finally {
    if (cache) {
      cache.set(prevObj, {
        [NEXT_OBJECT_PROPERTY]: nextObj,
        [CHANGED_PROPERTY]: changed,
      });
    }
  }
};

// explicitly track object with memo
export const trackMemo = (obj: unknown) => {
  if (isObjectToTrack(obj)) {
    return TRACK_MEMO_SYMBOL in obj;
  }
  return false;
};

/**
 * Unwrap proxy to get the original object.
 *
 * Used to retrieve the original object used to create the proxy instance with `createProxy`.
 *
 * @param {Proxy<object>} obj -  The proxy wrapper of the originial object.
 * @returns {object | null} - Return either the unwrapped object if exists.
 *
 * @example
 * import { createProxy, getUntracked } from 'proxy-compare';
 *
 * const original = { a: "1", c: "2", d: { e: "3" } };
 * const accessed = new WeakMap();
 *
 * const proxy = createProxy(original, accessed);
 * const originalFromProxy = getUntracked(proxy)
 *
 * Object.is(original, originalFromProxy) // true
 * isChanged(original, originalFromProxy, accessed) // false
 */
export const getUntracked = <T>(obj: T): T | null => {
  if (isObjectToTrack(obj)) {
    return (obj as { [GET_ORIGINAL_SYMBOL]?: T })[GET_ORIGINAL_SYMBOL] || null;
  }
  return null;
};

/**
 * Mark object to be tracked.
 *
 * This function marks an object that will be passed into `createProxy`
 * as marked to track or not. By default only Array and Object are marked to track,
 * so this is useful for example to mark a class instance to track or to mark an object
 * to be untracked when creating your proxy.
 *
 * @param obj - Object to mark as tracked or not.
 * @param mark - Boolean indicating whether you want to track this object or not.
 * @returns - No return.
 *
 * @example
 * import { createProxy, markToTrack, isChanged } from 'proxy-compare';
 *
 * const nested = { e: "3" }
 *
 * markToTrack(nested, false)
 *
 * const original = { a: "1", c: "2", d: nested };
 * const accessed = new WeakMap();
 *
 * const proxy = createProxy(original, accessed);
 *
 * proxy.d.e
 *
 * isChanged(original, { d: { e: "3" } }, accessed) // true
 * // Even though `{ e: "3" } is structurally equivalent to `nested`, because `nested` was not
 * // tracked, `isChanged` sees the new `{ e: "3" }` as a new instance with no equal keys and so
 * // by default considers it changed.
 */
export const markToTrack = (obj: object, mark = true) => {
  objectsToTrack.set(obj, mark);
};

/**
 * Convert `accessed` to a list of paths.
 *
 * Because `accessed` is a WeakMap, it is not easy to print/log for debugging.
 *
 * `getPathList` converts `accessed` to a list of paths. It should primarily be used for debugging,
 * because `isChanged` is the canonical API for asking "are there changes?".
 *
 * @example
 * import { createProxy, markToTrack, isChanged } from 'proxy-compare';
 *
 * const nested = { e: "3" }
 * markToTrack(nested, false)
 * const original = { a: "1", c: "2", d: nested };
 *
 * const accessed = new WeakMap();
 * const proxy = createProxy(original, accessed);
 * proxy.a
 * proxy.d.e
 *
 * getPathList(accessed) //  [['a'], ['d', 'e']]
 *
 * @param obj - An object that is used with `createProxy`.
 * @param accessed - A weak map that is used with `createProxy`.
 * @param onlyWithValues - An optional boolean to exclude object getters.
 * @returns - An array of paths.
 */
export const getPathList = (
  obj: unknown,
  accessed: WeakMap<object, unknown>,
  onlyWithValues?: boolean,
): (string | symbol)[][] => {
  const list: (string | symbol)[][] = [];
  const seen = new WeakSet();
  const walk = (x: unknown, path?: (string | symbol)[]) => {
    if (seen.has(x as object)) {
      // for object with cycles
      return;
    }
    if (isObject(x)) {
      seen.add(x);
    }
    const used = isObject(x) && (accessed as Accessed).get(getOriginalObject(x));
    if (used) {
      used[HAS_KEY_PROPERTY]?.forEach((key) => {
        const segment = `:has(${String(key)})`;
        list.push(path ? [...path, segment] : [segment]);
      });
      if (used[ALL_OWN_KEYS_PROPERTY] === true) {
        const segment = ':ownKeys';
        list.push(path ? [...path, segment] : [segment]);
      } else {
        used[HAS_OWN_KEY_PROPERTY]?.forEach((key) => {
          const segment = `:hasOwn(${String(key)})`;
          list.push(path ? [...path, segment] : [segment]);
        });
      }
      used[KEYS_PROPERTY]?.forEach((key) => {
        if (!onlyWithValues || 'value' in (Object.getOwnPropertyDescriptor(x, key) || {})) {
          walk((x as any)[key], path ? [...path, key] : [key]);
        }
      });
    } else if (path) {
      list.push(path);
    }
  };
  walk(obj);
  return list;
};

/**
 * Convert `accessed` to a list of paths
 *
 * `accessed` is a weak map which is not printable.
 * This function is can convert it to printable path list.
 * It's for debugging purpose.
 *
 * @param obj - An object that is used with `createProxy`.
 * @param accessed - A weak map that is used with `createProxy`.
 * @param onlyWithValues - An optional boolean to exclude object getters.
 * @deprecated - Use `getPathList` instead.
 * @returns - An array of paths.
 */
export const affectedToPathList = getPathList

/**
 * replace newProxy function.
 *
 * This can be used if you want to use proxy-polyfill.
 * Note that proxy-polyfill can't polyfill everything.
 * Use it at your own risk.
 */
export const replaceNewProxy = (fn: typeof newProxy) => {
  newProxy = fn;
};
