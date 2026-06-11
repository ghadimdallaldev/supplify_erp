// File types
export interface PresignedUrlRequest {
  fileName: string
  fileType: string
  fileSize?: number
}

export interface PresignedUrlResponse {
  presignedUrl: string
  fileKey: string
  fileName: string
  fileType: string
}

export interface AttachFileRequest {
  fileKey: string
  fileName: string
  fileType?: string
}

export interface Attachment {
  id: string
  owner_type: string
  owner_id: string
  url: string
  type?: string
  meta?: Record<string, any>
}
