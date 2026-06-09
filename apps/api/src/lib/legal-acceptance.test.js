import { describe, expect, it, vi } from 'vitest'
import { ValidationError } from '../middlewares/errorHandler.js'
import {
  validateLegalAcceptancePayload,
  recordRegistrationLegalAcceptances,
  resolveRequiredLegalDocuments,
  getUserLegalAcceptanceStatus,
  recordLoginLegalReacceptances,
} from './legal-acceptance.js'
import { LEGAL_PACK_VERSION, requiredRegistrationDocuments } from './legal-documents.js'

vi.mock('./db.js', () => ({
  query: vi.fn(),
}))

import { query } from './db.js'

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
    it('inserts all accepted documents in one bulk statement', async () => {
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
      expect(calls).toHaveLength(1)
      expect(calls[0][0]).toContain('INSERT INTO legal_acceptance')
      expect(calls[0][0]).toContain('unnest')
      expect(calls[0][1][3]).toHaveLength(required.length)
    })
  })

  describe('resolveRequiredLegalDocuments', () => {
    it('uses registration pack when user registered as supplier', () => {
      const result = resolveRequiredLegalDocuments({
        role: 'SUPPLIER',
        tenantType: 'SUPPLIER',
        rows: [{ context: 'registration', tenant_type: 'SUPPLIER' }],
      })
      expect(result.variant).toBe('registration')
      expect(result.accountType).toBe('SUPPLIER')
      expect(result.required).toEqual(requiredRegistrationDocuments('SUPPLIER'))
    })

    it('uses invite pack for admin without registration history', () => {
      const result = resolveRequiredLegalDocuments({
        role: 'ADMIN',
        tenantType: null,
        rows: [{ context: 'invite', tenant_type: null, document_slug: 'terms_and_conditions' }],
      })
      expect(result.variant).toBe('invite')
      expect(result.accountType).toBe(null)
    })
  })

  describe('getUserLegalAcceptanceStatus', () => {
    it('flags stale pack version as needing reacceptance', async () => {
      query.mockResolvedValueOnce({
        rows: requiredRegistrationDocuments('RESTAURANT').map((slug) => ({
          document_slug: slug,
          document_version: '2026-05-28',
          context: 'registration',
          tenant_type: 'RESTAURANT',
        })),
      })
      const status = await getUserLegalAcceptanceStatus({
        userId: 'u1',
        role: 'RESTAURANT',
        tenantType: 'RESTAURANT',
      })
      expect(status.needsReacceptance).toBe(true)
      expect(status.missingDocuments.length).toBeGreaterThan(0)
      expect(status.currentPackVersion).toBe(LEGAL_PACK_VERSION)
    })

    it('passes when all required docs match current pack', async () => {
      query.mockResolvedValueOnce({
        rows: requiredRegistrationDocuments('RESTAURANT').map((slug) => ({
          document_slug: slug,
          document_version: LEGAL_PACK_VERSION,
          context: 'registration',
          tenant_type: 'RESTAURANT',
        })),
      })
      const status = await getUserLegalAcceptanceStatus({
        userId: 'u1',
        role: 'RESTAURANT',
        tenantType: 'RESTAURANT',
      })
      expect(status.needsReacceptance).toBe(false)
      expect(status.missingDocuments).toEqual([])
    })
  })

  describe('recordLoginLegalReacceptances', () => {
    it('inserts login_refresh acceptances for required docs', async () => {
      const calls = []
      query
        .mockResolvedValueOnce({
          rows: [
            {
              context: 'registration',
              tenant_type: 'SUPPLIER',
              document_slug: 'terms_and_conditions',
              document_version: '2026-05-28',
            },
          ],
        })
        .mockImplementation((...args) => {
          calls.push(args)
          return Promise.resolve({ rows: [] })
        })

      const required = requiredRegistrationDocuments('SUPPLIER')
      await recordLoginLegalReacceptances({
        userId: 'u1',
        tenantId: 't1',
        tenantType: 'SUPPLIER',
        role: 'SUPPLIER',
        acceptedDocuments: required,
        electronicSignatureAttestation: true,
        packVersion: LEGAL_PACK_VERSION,
      })

      expect(calls).toHaveLength(1)
      expect(calls[0][1][5].every((ctx) => ctx === 'login_refresh')).toBe(true)
    })
  })
})
