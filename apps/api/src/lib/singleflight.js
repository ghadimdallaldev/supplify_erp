/** Coalesce concurrent in-flight work for the same key (thundering-herd guard). */
const inflight = new Map()

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function singleflight(key, fn) {
  const existing = inflight.get(key)
  if (existing) return existing

  const promise = Promise.resolve()
    .then(fn)
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, promise)
  return promise
}

/** @internal Test helper */
export function resetSingleflightForTests() {
  inflight.clear()
}
