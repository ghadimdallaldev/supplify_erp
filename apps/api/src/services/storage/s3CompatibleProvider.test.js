import { describe, expect, it } from 'vitest'
import { hasPrivateAccessProof, isRailwayStorageEndpoint } from './s3CompatibleProvider.js'

describe('S3 private-access verification', () => {
  it('recognizes Railway Storage endpoints', () => {
    expect(isRailwayStorageEndpoint('https://t3.storageapi.dev')).toBe(true)
    expect(isRailwayStorageEndpoint('https://storage.railway.app')).toBe(true)
    expect(isRailwayStorageEndpoint('https://s3.amazonaws.com')).toBe(false)
  })

  it('accepts Railway private-only buckets with an empty access-block response', () => {
    expect(
      hasPrivateAccessProof({
        endpoint: 'https://t3.storageapi.dev',
        storagePublicRead: false,
        publicGrant: false,
        publicPolicy: false,
        publicAccessBlockConfiguration: {},
      })
    ).toBe(true)
  })

  it('still requires explicit access-block flags for generic S3', () => {
    expect(
      hasPrivateAccessProof({
        endpoint: 'https://s3.amazonaws.com',
        storagePublicRead: false,
        publicGrant: false,
        publicPolicy: false,
        publicAccessBlockConfiguration: {},
      })
    ).toBe(false)
    expect(
      hasPrivateAccessProof({
        endpoint: 'https://s3.amazonaws.com',
        storagePublicRead: false,
        publicGrant: false,
        publicPolicy: false,
        publicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
          BlockPublicPolicy: true,
          RestrictPublicBuckets: true,
        },
      })
    ).toBe(true)
  })

  it('rejects public configuration even for Railway Storage', () => {
    expect(
      hasPrivateAccessProof({
        endpoint: 'https://t3.storageapi.dev',
        storagePublicRead: false,
        publicGrant: true,
        publicPolicy: false,
        publicAccessBlockConfiguration: {},
      })
    ).toBe(false)
    expect(
      hasPrivateAccessProof({
        endpoint: 'https://t3.storageapi.dev',
        storagePublicRead: true,
        publicGrant: false,
        publicPolicy: false,
        publicAccessBlockConfiguration: {},
      })
    ).toBe(false)
  })
})
