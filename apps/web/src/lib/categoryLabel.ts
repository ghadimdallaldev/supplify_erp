/**
 * Display name of a platform category, shelf or similar `{ name, name_ar }` record in the
 * current UI language (Arabic falls back to English when the Arabic name is missing).
 */
export function localizedName(
  node: { name?: string | null; name_ar?: string | null } | null | undefined,
  language: string | undefined
): string {
  if (!node) return ''
  if (language?.startsWith('ar') && node.name_ar) return node.name_ar
  return node.name ?? ''
}

/** Same as localizedName for camelCase payloads (`categoryName` / `categoryNameAr`). */
export function localizedCategoryName(
  item: { categoryName?: string | null; categoryNameAr?: string | null; category?: string | null },
  language: string | undefined
): string {
  if (language?.startsWith('ar') && item.categoryNameAr) return item.categoryNameAr
  return item.categoryName ?? item.category ?? ''
}
