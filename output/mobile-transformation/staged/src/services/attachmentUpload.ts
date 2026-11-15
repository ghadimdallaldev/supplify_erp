import * as DocumentPicker from 'expo-document-picker'
import { Platform } from 'react-native'
import { resolveDevHostForAndroid } from '../config/env'
import { api } from './api/client'

export type ChatAttachment = {
  fileUrl: string
  fileType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
  fileName: string
  fileSize?: number
}

export type PickedAttachment = {
  uri: string
  name: string
  mimeType: ChatAttachment['fileType']
  size: number
}

const allowedTypes = new Set<ChatAttachment['fileType']>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])

function resolveMimeType(
  name: string,
  mimeType?: string | null
): ChatAttachment['fileType'] | null {
  if (mimeType && allowedTypes.has(mimeType as ChatAttachment['fileType'])) {
    return mimeType as ChatAttachment['fileType']
  }
  const extension = name.toLowerCase().split('.').pop()
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'pdf') return 'application/pdf'
  return null
}

export async function pickChatAttachments(): Promise<PickedAttachment[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [...allowedTypes],
    multiple: true,
    copyToCacheDirectory: true,
  })
  if (result.canceled) return []
  return result.assets.slice(0, 5).map((asset) => {
    const mimeType = resolveMimeType(asset.name, asset.mimeType)
    if (!mimeType) throw new Error(`${asset.name} is not a supported file type.`)
    const size = Number(asset.size || 0)
    if (size > 10 * 1024 * 1024) throw new Error(`${asset.name} is larger than 10 MB.`)
    return { uri: asset.uri, name: asset.name, mimeType, size }
  })
}

export async function uploadChatAttachment(file: PickedAttachment): Promise<ChatAttachment> {
  const presign = await api.post<{
    presignedUrl?: string
    url?: string
    publicUrl?: string
  }>('/api/files/presign', {
    fileName: file.name,
    fileType: file.mimeType,
    fileSize: file.size,
  })
  const uploadUrl = presign.presignedUrl || presign.url
  if (!uploadUrl || !presign.publicUrl) throw new Error('Upload service did not return a file URL.')
  const localResponse = await fetch(file.uri)
  const blob = await localResponse.blob()
  const resolvedUrl =
    __DEV__ && Platform.OS === 'android' ? resolveDevHostForAndroid(uploadUrl) : uploadUrl
  const response = await fetch(resolvedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.mimeType },
    body: blob,
  })
  if (!response.ok) throw new Error('Attachment upload failed. Please try again.')
  return {
    fileUrl: presign.publicUrl,
    fileType: file.mimeType,
    fileName: file.name,
    fileSize: file.size,
  }
}
