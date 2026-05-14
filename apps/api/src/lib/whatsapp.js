/**
 * WhatsApp deep links (wa.me). These open WhatsApp with a pre-filled message.
 * They do not push messages server-side — the user taps the link to send.
 */
export function normalizeWhatsAppPhone(phone) {
  return String(phone || '').replace(/\D/g, '')
}

export function buildWhatsAppUrl(phone, message) {
  const digits = normalizeWhatsAppPhone(phone)
  if (!digits) return null
  const text = message ? `?text=${encodeURIComponent(message)}` : ''
  return `https://wa.me/${digits}${text}`
}
