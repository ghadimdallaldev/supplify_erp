import {
  filenameForPodMime,
  isPodPhotoWithinSizeLimit,
  MAX_POD_PHOTO_BYTES,
  preparePodImage,
  resolvePresignUploadUrl,
  uploadPreparedPodImage,
} from './podValidation'

const mockUpload = jest.fn()

jest.mock('expo-file-system', () => ({
  UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  File: jest.fn().mockImplementation((uri: string) => ({ uri, upload: mockUpload })),
}))

jest.mock('../features/auth/tokenStorage', () => ({
  getAccessToken: jest.fn().mockResolvedValue('access-token'),
  getActiveTenantToken: jest.fn().mockResolvedValue('tenant-token'),
}))

describe('podValidation', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  it('allows photos under 10 MB', () => {
    expect(MAX_POD_PHOTO_BYTES).toBe(10 * 1024 * 1024)
    expect(isPodPhotoWithinSizeLimit(1024)).toBe(true)
    expect(isPodPhotoWithinSizeLimit(null)).toBe(true)
  })

  it('rejects oversized photos', () => {
    expect(isPodPhotoWithinSizeLimit(MAX_POD_PHOTO_BYTES + 1)).toBe(false)
  })

  it('resolves presign upload URL', () => {
    expect(resolvePresignUploadUrl({ presignedUrl: 'https://a' })).toBe('https://a')
    expect(resolvePresignUploadUrl({ url: 'https://b' })).toBe('https://b')
    expect(resolvePresignUploadUrl({})).toBeNull()
  })

  it('uses the actual local blob size and MIME before presigning', async () => {
    const blob = { size: 345, type: 'image/png' } as Blob
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, blob: async () => blob })

    await expect(preparePodImage('file:///proof.jpg', 'image/jpeg')).resolves.toEqual({
      uri: 'file:///proof.jpg',
      blob,
      bytes: 345,
      mimeType: 'image/png',
    })
    expect(filenameForPodMime('camera.jpeg', 'image/png')).toBe('camera.png')
  })

  it('keeps upload errors actionable without exposing the tokenized URL', async () => {
    mockUpload.mockResolvedValue({
      status: 400,
      body: JSON.stringify({ error: { message: 'Invalid image file' } }),
    })

    await expect(
      uploadPreparedPodImage('https://api.example/api/files/upload/secret-token', {
        uri: 'file:///proof.jpg',
        blob: {} as Blob,
        bytes: 10,
        mimeType: 'image/jpeg',
      })
    ).rejects.toThrow('Invalid image file')
    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringContaining('/api/files/upload/'),
      expect.objectContaining({
        httpMethod: 'PUT',
        uploadType: 0,
        mimeType: 'image/jpeg',
        headers: expect.objectContaining({
          'Content-Type': 'image/jpeg',
          Authorization: 'Bearer access-token',
          'X-Active-Tenant-Token': 'tenant-token',
          'X-Requested-With': 'Supplify',
        }),
      })
    )
  })

  it('provides replacement guidance for malware and retry guidance for scanner outages', async () => {
    mockUpload
      .mockResolvedValueOnce({
        status: 422,
        body: JSON.stringify({ error: { name: 'UPLOAD_MALWARE_DETECTED' } }),
      })
      .mockResolvedValueOnce({
        status: 503,
        body: JSON.stringify({ error: { name: 'MALWARE_SCAN_UNAVAILABLE' } }),
      })

    await expect(
      uploadPreparedPodImage('https://api.example/api/files/upload/token', {
        uri: 'file:///proof.jpg',
        blob: {} as Blob,
        bytes: 10,
        mimeType: 'image/jpeg',
      })
    ).rejects.toThrow('Retake or choose a different photo')
    await expect(
      uploadPreparedPodImage('https://api.example/api/files/upload/token', {
        uri: 'file:///proof.jpg',
        blob: {} as Blob,
        bytes: 10,
        mimeType: 'image/jpeg',
      })
    ).rejects.toThrow('Retry this photo upload')
  })
})
