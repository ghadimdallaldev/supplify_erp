/**
 * Deterministic multilingual category matcher (English, Arabic, Lebanese, French).
 *
 * Every word it knows comes from the platform tree (name, name_ar, name_fr, aliases) seeded by
 * the migrations; this module only normalises and scores. Spec §5.5 / §11.5.
 *
 * Scores per phrase: exact 1.0, whole phrase contained 0.9, all tokens present 0.8, prefix 0.6.
 * A candidate whose matched input words are a strict subset of the winner's ("tomato" inside
 * "tomato paste") does not compete with it: the longest matching phrase wins.
 * Suggestions need ≥ 0.6 (top 3); automatic classification needs ≥ 0.85 and a lead of ≥ 0.1
 * over the best competing candidate.
 */
import { getCache, setCache } from './cache.js'
import { query as defaultQuery } from './db.js'
import { getCatalogVersion } from './relationship-cache.js'

export const SUGGESTION_MIN_SCORE = 0.6
export const AUTO_MIN_SCORE = 0.85
export const AUTO_MIN_LEAD = 0.1
const EPSILON = 1e-9
const MAX_SUGGESTIONS = 3

const UNIT_PATTERN =
  /\d+([.,]\d+)?\s*(kg|g|gr|l|lt|ml|cl|pcs|pc|pack|x|كغ|كلغ|غ|غرام|لتر|مل)(?=\s|$)/gu
const FRENCH_ARTICLES = new Set(['de', 'du', 'des', 'la', 'le', 'les'])
const ELISION = /(^|[^\p{L}])[ld]['’](?=\p{L})/gu

function toAsciiDigits(text) {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
}

function singularise(token) {
  if (!/^[a-z]+$/.test(token) || token.length <= 3) return token
  if (token.endsWith('eaux')) return token.slice(0, -1)
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`
  if (token.length > 4 && token.endsWith('ie')) return `${token.slice(0, -2)}y`
  if (/(ss|sh|ch|x|z|o)es$/.test(token)) return token.slice(0, -2)
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1)
  return token
}

function normaliseToken(token) {
  if (/\d/.test(token)) return null
  if (FRENCH_ARTICLES.has(token)) return null
  if (/^ال[؀-ۿ]{2,}$/.test(token)) return token.slice(2)
  return singularise(token)
}

/**
 * @param {string} text
 * @returns {{ normalized: string, tokens: string[] }}
 */
export function normalizeCategoryText(text) {
  let s = toAsciiDigits(String(text ?? '').toLowerCase())
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ـ/g, '')
    .replace(/ٱ/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
  s = s.replace(UNIT_PATTERN, ' ').replace(ELISION, '$1 ')
  const tokens = s
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(normaliseToken)
    .filter(Boolean)
  return { normalized: tokens.join(' '), tokens }
}

const preparedPhrases = new WeakMap()

function phrasesOf(category) {
  let phrases = preparedPhrases.get(category)
  if (!phrases) {
    const seen = new Set()
    phrases = []
    for (const raw of [
      category.name,
      category.name_ar,
      category.name_fr,
      ...(category.aliases || []),
    ]) {
      if (!raw) continue
      const phrase = normalizeCategoryText(raw)
      if (!phrase.tokens.length || seen.has(phrase.normalized)) continue
      seen.add(phrase.normalized)
      phrases.push(phrase)
    }
    preparedPhrases.set(category, phrases)
  }
  return phrases
}

function scorePhrase(input, phrase) {
  const { tokens } = input
  const p = phrase.tokens
  if (input.normalized === phrase.normalized) {
    return { score: 1, covered: tokens.map((_, i) => i) }
  }
  for (let i = 0; i + p.length <= tokens.length; i++) {
    if (p.every((t, j) => tokens[i + j] === t)) {
      return { score: 0.9, covered: p.map((_, j) => i + j) }
    }
  }
  const indices = p.map((t) => tokens.indexOf(t))
  if (indices.every((i) => i >= 0)) return { score: 0.8, covered: [...new Set(indices)] }
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.length >= 3 && p.some((q) => q.startsWith(t))) return { score: 0.6, covered: [i] }
  }
  return null
}

/**
 * @param {{ normalized: string, tokens: string[] }} normalizedInput
 * @param {{ name?: string, name_ar?: string, name_fr?: string, aliases?: string[] }} category
 * @returns {{ score: number, matchedPhraseLength: number, covered: number[] }}
 */
export function scoreCategory(normalizedInput, category) {
  let best = { score: 0, matchedPhraseLength: 0, covered: [] }
  if (!normalizedInput?.tokens?.length) return best
  for (const phrase of phrasesOf(category)) {
    const match = scorePhrase(normalizedInput, phrase)
    if (!match) continue
    const better =
      match.score > best.score ||
      (match.score === best.score && phrase.tokens.length > best.matchedPhraseLength)
    if (better) {
      best = {
        score: match.score,
        matchedPhraseLength: phrase.tokens.length,
        covered: match.covered,
      }
    }
  }
  return best
}

function isStrictSubset(a, b) {
  return a.length < b.length && a.every((i) => b.includes(i))
}

/**
 * @param {string} text product name (or any category text)
 * @param {Array<{ id: string, parent_category_id?: string|null }>} categories platform tree;
 *   departments (no parent) are ignored
 * @returns {{ suggestions: Array<{ categoryId: string, score: number }>, autoCategoryId: string|null }}
 */
export function classifyProduct(text, categories) {
  const input = normalizeCategoryText(text)
  if (!input.tokens.length) return { suggestions: [], autoCategoryId: null }

  const scored = []
  for (const category of categories || []) {
    if (!category.parent_category_id) continue
    const result = scoreCategory(input, category)
    if (result.score > 0) scored.push({ category, ...result })
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.matchedPhraseLength - a.matchedPhraseLength ||
      b.covered.length - a.covered.length ||
      (a.category.display_order ?? 0) - (b.category.display_order ?? 0)
  )

  const suggestions = scored
    .filter((s) => s.score >= SUGGESTION_MIN_SCORE)
    .slice(0, MAX_SUGGESTIONS)
    .map((s) => ({ categoryId: s.category.id, score: s.score }))

  let autoCategoryId = null
  const top = scored[0]
  if (top && top.score >= AUTO_MIN_SCORE - EPSILON) {
    const rival = scored.slice(1).find((s) => !isStrictSubset(s.covered, top.covered))
    if (!rival || top.score - rival.score >= AUTO_MIN_LEAD - EPSILON) {
      autoCategoryId = top.category.id
    }
  }
  return { suggestions, autoCategoryId }
}

let memo = { key: null, value: null }

/**
 * Active platform categories (departments and leaves), cached under
 * `platformCategories:<catalogVersion>` (in-process memo, then the shared cache).
 * @param {{ query: Function }} [db] pool or client; defaults to lib/db.js
 */
export async function loadPlatformCategories(db) {
  const key = `platformCategories:${await getCatalogVersion()}`
  if (memo.key === key) return memo.value
  let rows = await getCache(key).catch(() => null)
  if (!Array.isArray(rows)) {
    const run = db?.query ? (sql) => db.query(sql) : (sql) => defaultQuery(sql)
    const result = await run(
      `SELECT id, slug, name, name_ar, name_fr, aliases, icon_key, parent_category_id, display_order
       FROM product_category
       WHERE supplier_id IS NULL AND is_active
       ORDER BY display_order, name`
    )
    rows = result.rows
    await setCache(key, rows, 300).catch(() => undefined)
  }
  memo = { key, value: rows }
  return rows
}

/** Test hook: forget the in-process memo. */
export function resetPlatformCategoriesMemoForTests() {
  memo = { key: null, value: null }
}
