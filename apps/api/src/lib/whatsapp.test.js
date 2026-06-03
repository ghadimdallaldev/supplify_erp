import { describe, it, expect } from 'vitest'
import { buildWhatsAppUrl, normalizeWhatsAppPhone } from './whatsapp.js'

describe('whatsapp helpers', () => {
  describe('normalizeWhatsAppPhone', () => {
    it('strips non-digit characters', () => {
      expect(normalizeWhatsAppPhone('+961 76 911 906')).toBe('96176911906')
    })

    it('returns empty string for nullish input', () => {
      expect(normalizeWhatsAppPhone(null)).toBe('')
    })
  })

  describe('buildWhatsAppUrl', () => {
    it('builds wa.me link with encoded message', () => {
      const url = buildWhatsAppUrl('+96176911906', 'Hello guest')
      expect(url).toBe('https://wa.me/96176911906?text=Hello%20guest')
    })

    it('returns null when phone is missing', () => {
      expect(buildWhatsAppUrl('', 'Hello')).toBeNull()
    })
  })
})
