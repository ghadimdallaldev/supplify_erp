import { describe, expect, it } from 'vitest'
import { ValidationError } from '../middlewares/errorHandler.js'
import {
  validateLegalAcceptancePayload,
  recordRegistrationLegalAcceptances,
} from './legal-acceptance.js'
import { LEGAL_PACK_VERSION, requiredRegistrationDocuments } from './legal-documents.js'

describe('legal-acceptance', () => {
  describe('validateLegalAcceptancePayload', () => {
    it('rejects when electronic signature attestation is missing', () => {
      expect(() =>
        validateLegalAcceptancePayload({
          acceptedDocuments: ['terms_and_conditions'],
          requiredDocuments: ['terms_and_conditions'],
          electronicSignatureAttestation: false,
        })
      ).toThrow(ValidationError)
    })

    it('rejects stale pack version', () => {
      expect(() =>
        validateLegalAcceptancePayload({
          acceptedDocuments: requiredRegistrationDocuments('RESTAURANT'),
          requiredDocuments: requiredRegistrationDocuments('RESTAURANT'),
          electronicSignatureAttestation: true,
          packVersion: '2020-01-01',
        })
      ).toThrow(/updated/)
    })

    it('rejects missing required documents', () => {
      expect(() =>
        validateLegalAcceptancePayload({
          acceptedDocuments: ['terms_and_conditions', 'privacy_policy'],
          requiredDocuments: requiredRegistrationDocuments('RESTAURANT'),
          electronicSignatureAttestation: true,
          packVersion: LEGAL_PACK_VERSION,
        })
      ).toThrow(/required legal agreements/)
    })

    it('accepts full restaurant registration pack', () => {
      const required = requiredRegistrationDocuments('RESTAURANT')
      const accepted = validateLegalAcceptancePayload({
        acceptedDocuments: required,
        requiredDocuments: required,
        electronicSignatureAttestation: true,
        packVersion: LEGAL_PACK_VERSION,
      })
      expect(accepted.size).toBe(required.length)
    })
  })

  describe('recordRegistrationLegalAcceptances', () => {
    it('inserts one row per accepted document', async () => {
      const calls = []
      const client = {
        query: (...args) => {
          calls.push(args)
          return Promise.resolve({ rows: [] })
        },
      }
      const required = requiredRegistrationDocuments('SUPPLIER')
      await recordRegistrationLegalAcceptances(
        {
          userId: 'u1',
          tenantId: 't1',
          tenantType: 'SUPPLIER',
          acceptedDocuments: required,
          electronicSignatureAttestation: true,
          packVersion: LEGAL_PACK_VERSION,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
        client
      )
      expect(calls).toHaveLength(required.length)
      expect(calls[0][0]).toContain('INSERT INTO legal_acceptance')
    })
  })
})
