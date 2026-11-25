/**
 * Search-as-you-type helpers for product full-text search.
 *
 * `plainto_tsquery` only matches whole lexemes, so "tom" never finds "Tomatoes".
 * `toPrefixTsQuery` turns free text into a safe prefix tsquery string
 * ("tom ch" -> "tom:* & ch:*") for `to_tsquery('simple', $n)`. Every term is reduced to
 * Unicode letters/digits, so user input can never inject tsquery operators.
 */

const MAX_TERMS = 6

/** Free text -> tsquery source with prefix matching, or null when nothing searchable remains. */
export function toPrefixTsQuery(input) {
  const terms = String(input ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, MAX_TERMS)
  if (terms.length === 0) return null
  return terms.map((term) => `${term}:*`).join(' & ')
}

/** LIKE pattern for a substring match on a name, with LIKE wildcards escaped. */
export function toContainsPattern(input) {
  const escaped = String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\\%_]/g, (ch) => `\\${ch}`)
  return `%${escaped}%`
}
