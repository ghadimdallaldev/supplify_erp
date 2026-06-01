import { describe, it, expect } from 'vitest'
import { assertChatAttachmentUrl, resolveUploadKeyFromPublicUrl } from './sanitize-upload.js'

describe('sanitize-upload', () => {
  it('resolveUploadKeyFromPublicUrl accepts API proxy URLs', () => {
    const key = resolveUploadKeyFromPublicUrl(
      'https://api.example.com/api/files/object?key=uploads%2Fuser-1%2F123-photo.jpg'
    )
    expect(key).toBe('uploads/user-1/123-photo.jpg')
  })

  it('assertChatAttachmentUrl accepts proxy URL for owner', () => {
    const key = assertChatAttachmentUrl(
      'https://api.example.com/api/files/object?key=uploads/user-1/file.pdf',
      'user-1'
    )
    expect(key).toBe('uploads/user-1/file.pdf')
  })
})
