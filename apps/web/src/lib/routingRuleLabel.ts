import { localizedName } from './categoryLabel'

/** A row from GET /api/warehouses/routing/rules (target names are joined by the API). */
export type WarehouseRoutingRule = {
  id: string
  rule_type?: string | null
  priority?: number | null
  warehouse_name?: string | null
  category_name?: string | null
  category_name_ar?: string | null
  shelf_name?: string | null
  shelf_name_ar?: string | null
  shelf_archived_at?: string | null
}

// The warehouse settings screen is English-only today; keep these with it.
const TYPE_LABELS: Record<string, string> = {
  product: 'Product',
  category: 'Category',
  shelf: 'Shelf',
  zone: 'Zone',
  stock_available: 'Stock available',
  default: 'Default',
}

/** "Shelf: Cheese counter → Cold store (priority 1)". */
export function routingRuleLabel(rule: WarehouseRoutingRule, language: string): string {
  const type = rule.rule_type ?? ''
  const typeLabel = TYPE_LABELS[type] ?? (type || 'Rule')
  let target = ''
  if (type === 'shelf' && rule.shelf_name) {
    target = localizedName({ name: rule.shelf_name, name_ar: rule.shelf_name_ar }, language)
    if (rule.shelf_archived_at) target += ' (archived)'
  } else if (type === 'category' && rule.category_name) {
    target = localizedName({ name: rule.category_name, name_ar: rule.category_name_ar }, language)
  }
  if (!rule.warehouse_name) return `${typeLabel}: ${target || rule.id.slice(0, 8)}`
  const head = target ? `${typeLabel}: ${target}` : typeLabel
  const priority = rule.priority != null ? ` (priority ${rule.priority})` : ''
  return `${head} → ${rule.warehouse_name}${priority}`
}
