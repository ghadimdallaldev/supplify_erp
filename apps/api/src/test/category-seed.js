/**
 * Test utility: the platform category tree as the migrations define it, without a database.
 * Parses the seed rows of `0241_seed_horeca_category_tree.sql`
 *   ('slug', 'parent-slug' | NULL, 'name', 'name_ar', 'name_fr', 'icon', ord, ARRAY[...])
 * and applies alias additions from later `*_category_aliases*.sql` migrations
 *   ('slug', ARRAY[...]).
 * Ids are the slugs, so tests can assert on slugs directly.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../../db/migrations')

/** Split a SQL list body into values: quoted strings (with '' escapes), NULL, or numbers. */
function parseSqlList(body) {
  const values = []
  let i = 0
  while (i < body.length) {
    const ch = body[i]
    if (ch === "'") {
      let value = ''
      i += 1
      while (i < body.length) {
        if (body[i] === "'" && body[i + 1] === "'") {
          value += "'"
          i += 2
        } else if (body[i] === "'") {
          i += 1
          break
        } else {
          value += body[i]
          i += 1
        }
      }
      values.push(value)
    } else if (/[A-Za-z0-9-]/.test(ch)) {
      const match = body.slice(i).match(/^[A-Za-z0-9.-]+/)
      const raw = match[0]
      values.push(raw.toUpperCase() === 'NULL' ? null : Number(raw))
      i += raw.length
    } else {
      i += 1
    }
  }
  return values
}

/** Rows shaped `(<scalars>, ARRAY[<strings>])`, skipping SQL comments. */
function parseRows(sql) {
  const cleaned = sql.replace(/--[^\n]*/g, '')
  const rows = []
  const rowPattern =
    /\(\s*('(?:[^']|'')*'(?:\s*,\s*(?:'(?:[^']|'')*'|NULL|-?\d+))*)\s*,\s*ARRAY\[([\s\S]*?)\]\s*\)/g
  let match
  while ((match = rowPattern.exec(cleaned))) {
    rows.push({ scalars: parseSqlList(match[1]), aliases: parseSqlList(match[2]) })
  }
  return rows
}

let memo = null

/** @returns {Array<{id, slug, parent_category_id, name, name_ar, name_fr, icon_key, display_order, aliases}>} */
export function loadSeedCategories() {
  if (memo) return memo
  const files = readdirSync(migrationsDir).sort()
  const seedFile = files.find((f) => f.endsWith('_seed_horeca_category_tree.sql'))
  const categories = new Map()
  for (const { scalars, aliases } of parseRows(
    readFileSync(join(migrationsDir, seedFile), 'utf8')
  )) {
    const [slug, parentSlug, name, nameAr, nameFr, iconKey, ord] = scalars
    categories.set(slug, {
      id: slug,
      slug,
      parent_category_id: parentSlug,
      name,
      name_ar: nameAr,
      name_fr: nameFr,
      icon_key: iconKey,
      display_order: ord,
      aliases,
    })
  }
  for (const file of files.filter((f) => /_category_aliases.*\.sql$/.test(f))) {
    for (const { scalars, aliases } of parseRows(readFileSync(join(migrationsDir, file), 'utf8'))) {
      const category = categories.get(scalars[0])
      if (!category) throw new Error(`${file}: unknown category slug ${scalars[0]}`)
      category.aliases = [...new Set([...category.aliases, ...aliases])]
    }
  }
  memo = [...categories.values()]
  return memo
}
