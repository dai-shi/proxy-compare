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
export declare const createDeepProxy: <T>(obj: T, affected: WeakMap<object, unknown>, proxyCache?: WeakMap<object, unknown> | undefined) => T;
export declare const MODE_ASSUME_UNCHANGED_IF_UNAFFECTED = 1;
export declare const MODE_IGNORE_REF_EQUALITY = 2;
export declare const MODE_ASSUME_UNCHANGED_IF_UNAFFECTED_IN_DEEP: number;
export declare const MODE_IGNORE_REF_EQUALITY_IN_DEEP: number;
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
export declare const isDeepChanged: (origObj: unknown, nextObj: unknown, affected: WeakMap<object, unknown>, cache?: WeakMap<object, unknown> | undefined, mode?: number) => boolean;
export declare const trackMemo: (obj: unknown) => boolean;
export declare const getUntrackedObject: <T>(obj: T) => T | null;
