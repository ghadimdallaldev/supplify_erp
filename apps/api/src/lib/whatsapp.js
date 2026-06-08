/**
 * WhatsApp phone normalization helpers (used by whatsapp.service / Meta Cloud API).
 */
export function normalizeWhatsAppPhone(phone) {
  return String(phone || '').replace(/\D/g, '')
}

/**
 * E.164 digits with leading + (e.g. +96176911906).
 */
export function formatE164(phone) {
  const digits = normalizeWhatsAppPhone(phone)
  if (!digits) return null
  return `+${digits}`
}
