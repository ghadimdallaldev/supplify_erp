import twilio from 'twilio'
import { config } from '../config/env.js'
import { logger } from './logger.js'
import { normalizeWhatsAppPhone } from './whatsapp.js'

let client = null
/** @type {import('twilio').Twilio | null} */
let clientOverride = null

export function __setTwilioClientForTests(mockClient) {
  clientOverride = mockClient
}

export function __resetTwilioClientForTests() {
  clientOverride = null
  client = null
}

export function isTwilioConfigured() {
  return Boolean(config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN)
}

export function isTwilioWhatsAppConfigured() {
  return isTwilioConfigured() && Boolean(config.TWILIO_WHATSAPP_FROM)
}

export function getTwilioClient() {
  if (clientOverride) return clientOverride
  if (!isTwilioConfigured()) return null
  if (!client) {
    client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)
  }
  return client
}

/**
 * E.164 digits with leading + (e.g. +96176911906).
 */
export function formatE164(phone) {
  const digits = normalizeWhatsAppPhone(phone)
  if (!digits) return null
  return `+${digits}`
}

/**
 * Twilio WhatsApp address (whatsapp:+E164).
 */
export function formatWhatsAppAddress(phone) {
  const e164 = formatE164(phone)
  if (!e164) return null
  return `whatsapp:${e164}`
}

/**
 * Normalize configured WhatsApp sender to whatsapp:+... form.
 */
export function getTwilioWhatsAppFrom() {
  const raw = (config.TWILIO_WHATSAPP_FROM || '').trim()
  if (!raw) return null
  if (raw.startsWith('whatsapp:')) return raw
  const e164 = raw.startsWith('+') ? raw : `+${normalizeWhatsAppPhone(raw)}`
  if (!e164 || e164 === '+') {
    logger.warn('TWILIO_WHATSAPP_FROM is invalid')
    return null
  }
  return `whatsapp:${e164}`
}
