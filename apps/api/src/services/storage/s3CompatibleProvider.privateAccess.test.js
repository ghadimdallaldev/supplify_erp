import { beforeEach, describe, expect, it, vi } from 'vitest'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    S3Client: vi.fn(function () {
      this.send = send
    }),
  }
})

import { createS3CompatibleProvider } from './s3CompatibleProvider.js'

const config = {
  STORAGE_ENDPOINT: 'https://t3.storageapi.dev',
  STORAGE_BUCKET: 'private-test-bucket',
  STORAGE_REGION: 'auto',
  STORAGE_ACCESS_KEY_ID: 'test-key',
  STORAGE_SECRET_ACCESS_KEY: 'test-secret',
  STORAGE_PUBLIC_READ: false,
}

beforeEach(() => {
  send.mockReset()
  send.mockImplementation(async (command) => {
    if (command.constructor.name === 'GetBucketAclCommand') {
      return { Grants: [{ Permission: 'FULL_CONTROL', Grantee: { Type: 'CanonicalUser' } }] }
    }
    throw Object.assign(new Error('This S3 API is not implemented'), {
      name: 'NotImplemented',
      $metadata: { httpStatusCode: 501 },
    })
  })
})

describe('private bucket readiness with unsupported AWS metadata APIs', () => {
  it('accepts the live Railway response after verifying a private ACL and configuration', async () => {
    await expect(createS3CompatibleProvider(config).checkPrivateAccess()).resolves.toEqual({
      supported: true,
      private: true,
    })
    expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual([
      'GetBucketAclCommand',
      'GetBucketPolicyCommand',
      'GetPublicAccessBlockCommand',
    ])
  })

  it('still rejects unsupported public-access protection on generic S3', async () => {
    await expect(
      createS3CompatibleProvider({
        ...config,
        STORAGE_ENDPOINT: 'https://s3.amazonaws.com',
      }).checkPrivateAccess()
    ).resolves.toEqual({
      supported: true,
      private: false,
    })
  })

  it('still rejects public-read configuration on Railway', async () => {
    await expect(
      createS3CompatibleProvider({ ...config, STORAGE_PUBLIC_READ: true }).checkPrivateAccess()
    ).resolves.toEqual({
      supported: true,
      private: false,
    })
  })

  it('still rejects a public ACL even when AWS access-block metadata is unsupported', async () => {
    send.mockResolvedValueOnce({
      Grants: [
        {
          Permission: 'READ',
          Grantee: { Type: 'Group', URI: 'http://acs.amazonaws.com/groups/global/AllUsers' },
        },
      ],
    })
    await expect(createS3CompatibleProvider(config).checkPrivateAccess()).resolves.toEqual({
      supported: true,
      private: false,
    })
  })

  it('does not treat access denial as an unsupported API', async () => {
    const error = Object.assign(new Error('Denied'), { name: 'AccessDenied' })
    send.mockImplementationOnce(async () => ({ Grants: [] })).mockRejectedValueOnce(error)
    await expect(createS3CompatibleProvider(config).checkPrivateAccess()).rejects.toBe(error)
  })

  it('rejects an unreadable public-access-block response', async () => {
    const error = Object.assign(new Error('Denied'), { name: 'AccessDenied' })
    send
      .mockResolvedValueOnce({ Grants: [] })
      .mockRejectedValueOnce(Object.assign(new Error('No policy API'), { name: 'NotImplemented' }))
      .mockRejectedValueOnce(error)
    await expect(createS3CompatibleProvider(config).checkPrivateAccess()).rejects.toBe(error)
  })
})
