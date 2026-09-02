import { describe, it, expect } from 'vitest'
import { formatE164, normalizeWhatsAppPhone } from './whatsapp.js'

describe('whatsapp helpers', () => {
  describe('normalizeWhatsAppPhone', () => {
    it('strips non-digit characters', () => {
      expect(normalizeWhatsAppPhone('+961 76 911 906')).toBe('96176911906')
    })

    it('returns empty string for nullish input', () => {
      expect(normalizeWhatsAppPhone(null)).toBe('')
    })
  })

  describe('formatE164', () => {
    it('returns E.164 with leading plus', () => {
      expect(formatE164('+961 76 911 906')).toBe('+96176911906')
    })

    it('returns null when phone is missing', () => {
      expect(formatE164('')).toBeNull()
    })
  })
})
