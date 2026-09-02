/**
 * Seeded RNG for deterministic seed data.
 * Uses a simple mulberry32 PRNG. No Math.random().
 * @param {number} seed - Seed value (e.g. from process.env.SEED || 1337)
 */
export function createSeededRng(seed = 1337) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0; // mulberry32
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {() => number} rng
 * @param {number} min
 * @param {number} max
 * @returns {number} Integer in [min, max] inclusive
 */
export function intBetween(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * @param {() => number} rng
 * @param {number} min
 * @param {number} max
 * @returns {number} Float in [min, max]
 */
export function floatBetween(rng, min, max) {
  return rng() * (max - min) + min;
}

/**
 * @param {() => number} rng
 * @param {Array<T>} arr
 * @returns {T}
 * @template T
 */
export function pick(rng, arr) {
  if (!arr.length) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Shuffle array in place (Fisher–Yates). Mutates and returns arr.
 * @param {() => number} rng
 * @param {Array<T>} arr
 * @returns {Array<T>}
 * @template T
 */
export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
