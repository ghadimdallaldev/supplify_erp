/** Human-readable labels for tenant audit log filters and display. */

export const AUDIT_ACTION_LABELS = {
  'order.created': 'Order placed',
  'order.amendment_created': 'Order amendment requested',
  'order.amendment_accepted': 'Order amendment accepted',
  'product.created': 'Product created',
  'product.updated': 'Product updated',
  'promotion.created': 'Promotion created',
  'promotion.updated': 'Promotion updated',
  'billing.payment_method.added': 'Payment method added',
  'billing.checkout.completed': 'Checkout completed',
  'billing.pay_now.completed': 'Pay now completed',
  'billing.account.unlocked': 'Billing account unlocked',
  'catalog.image_import.started': 'Bulk image import started',
  'catalog.image_import.completed': 'Bulk image import completed',
  'catalog.image_import.cancelled': 'Bulk image import cancelled',
}

export const AUDIT_RESOURCE_LABELS = {
  order: 'Order',
  product: 'Product',
  promotion: 'Promotion',
  order_amendment: 'Order amendment',
  catalog_image_import: 'Catalog image import',
}

function humanizeToken(value) {
  if (!value) return ''
  return String(value)
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function getAuditActionLabel(action) {
  if (!action) return ''
  return AUDIT_ACTION_LABELS[action] || humanizeToken(action)
}

export function getAuditResourceLabel(resourceType) {
  if (!resourceType) return ''
  return AUDIT_RESOURCE_LABELS[resourceType] || humanizeToken(resourceType)
}

export function buildAuditFilterOptions(values, labelMap, getLabel) {
  const merged = new Set([...Object.keys(labelMap), ...values.filter(Boolean)])
  return [...merged]
    .sort((a, b) => getLabel(a).localeCompare(getLabel(b)))
    .map((value) => ({ value, label: getLabel(value) }))
}
