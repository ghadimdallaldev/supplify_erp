import { ValidationError } from '../middlewares/errorHandler.js'

export function isQuoteCalendarDate(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) ||
    value.startsWith('0000-')
  )
    return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function validateQuoteResponseItems(items) {
  if (!Array.isArray(items) || !items.length)
    throw new ValidationError('At least one response item is required')
  const seen = new Set()
  for (const item of items) {
    if (seen.has(item.quoteRequestItemId))
      throw new ValidationError('A quote request item can appear only once')
    seen.add(item.quoteRequestItemId)
    if (
      (item.isAvailable !== false && item.unitPrice == null) ||
      (item.unitPrice != null && (!Number.isFinite(item.unitPrice) || item.unitPrice < 0))
    )
      throw new ValidationError('Available items require a finite nonnegative unit price')
    if (item.quantity != null && (!Number.isFinite(item.quantity) || item.quantity <= 0))
      throw new ValidationError('Quoted quantity must be a finite positive number')
    if (item.currency != null && !/^[A-Za-z]{3}$/.test(item.currency))
      throw new ValidationError('Currency must be a three-letter code')
    if (item.deliveryDate != null && !isQuoteCalendarDate(item.deliveryDate))
      throw new ValidationError('Delivery date must be a valid calendar day (YYYY-MM-DD)')
  }
}
