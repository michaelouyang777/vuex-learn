/**
 * Get the first item that pass the test
 * by second argument function
 *
 * @param {Array} list
 * @param {Function} f
 * @return {*}
 */
export function find (list, f) {
  return list.filter(f)[0]
}

/**
 * Deep copy the given object considering circular structure.
 * This function caches all nested objects and its copies.
 * If it detects circular structure, use cached copy to avoid infinite loop.
 *
 * @param {*} obj
 * @param {Array<Object>} cache
 * @return {*}
 */
export function deepCopy (obj, cache = []) {
  // just return if obj is immutable value
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  // if obj is hit, it is in circular structure
  const hit = find(cache, c => c.original === obj)
  if (hit) {
    return hit.copy
  }

  const copy = Array.isArray(obj) ? [] : {}
  // put the copy into cache at first
  // because we want to refer it in recursive deepCopy
  cache.push({
    original: obj,
    copy
  })

  Object.keys(obj).forEach(key => {
    copy[key] = deepCopy(obj[key], cache)
  })

  return copy
}

/**
 * 遍历对象
 * @param {*} obj 
 * @param {*} fn 
 */
export function forEachValue (obj, fn) {
  Object.keys(obj).forEach(key => fn(obj[key], key))
}

/**
 * 判断是否对象
 * @param {*} obj 
 */
export function isObject (obj) {
  return obj !== null && typeof obj === 'object'
}

/**
 * 判断是否promise
 * @param {*} val 
 */
export function isPromise (val) {
  return val && typeof val.then === 'function'
}

/**
 * 判断是否存在对象，没有则抛出error
 * @param {*} condition 
 * @param {*} msg 
 */
export function assert (condition, msg) {
  if (!condition) throw new Error(`[vuex] ${msg}`)
}

/**
 * 传入一个函数和参数，再用一个函数将它们封装起来，返回一个新的而无需传参的函数。
 * 使用的是柯里化函数缓存了参数。
 * @param {*} fn 
 * @param {*} arg 
 */
export function partial (fn, arg) {
  return function () {
    return fn(arg)
  }
}
