import { describe, it, expect } from 'vitest'
import {
  assertChatAttachmentUrl,
  assertFileExtensionMatchesMime,
  resolveUploadKeyFromPublicUrl,
  neutralizeCsvField,
  escapeCsvField,
} from './sanitize-upload.js'

describe('sanitize-upload', () => {
  it('resolveUploadKeyFromPublicUrl accepts API proxy URLs', () => {
    const key = resolveUploadKeyFromPublicUrl(
      'https://api.example.com/api/files/object?key=uploads%2Fuser-1%2F123-photo.jpg'
    )
    expect(key).toBe('uploads/user-1/123-photo.jpg')
  })

  it('assertFileExtensionMatchesMime accepts matching jpeg extension', () => {
    expect(() => assertFileExtensionMatchesMime('photo.jpg', 'image/jpeg')).not.toThrow()
  })

  it('assertFileExtensionMatchesMime rejects exe as jpeg', () => {
    expect(() => assertFileExtensionMatchesMime('malware.exe', 'image/jpeg')).toThrow(/extension/i)
  })

  it('assertChatAttachmentUrl accepts proxy URL for owner', () => {
    const key = assertChatAttachmentUrl(
      'https://api.example.com/api/files/object?key=uploads/user-1/file.pdf',
      'user-1'
    )
    expect(key).toBe('uploads/user-1/file.pdf')
  })

  it('neutralizeCsvField prefixes formula-trigger characters', () => {
    expect(neutralizeCsvField('=1+1')).toBe("'=1+1")
    expect(neutralizeCsvField('-cmd')).toBe("'-cmd")
    expect(neutralizeCsvField('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(neutralizeCsvField('normal')).toBe('normal')
    expect(escapeCsvField('=evil')).toBe("'=evil")
    expect(escapeCsvField('a,b')).toBe('"a,b"')
  })
})
