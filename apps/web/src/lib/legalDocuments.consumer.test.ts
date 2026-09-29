import { describe, expect, it } from 'vitest'
import { requiredRegistrationSlugs } from './legalDocuments'

describe('consumer registration legal contract', () => {
  it('requires only platform Terms and Privacy', () => {
    expect(requiredRegistrationSlugs('CONSUMER')).toEqual([
      'terms_and_conditions',
      'privacy_policy',
    ])
  })

  it('keeps business registration documents unchanged', () => {
    expect(requiredRegistrationSlugs('RESTAURANT')).toContain('restaurant_agreement')
    expect(requiredRegistrationSlugs('SUPPLIER')).toContain('supplier_agreement')
  })
})
