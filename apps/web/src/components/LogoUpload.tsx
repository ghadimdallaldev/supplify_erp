import { useState, useRef } from 'react'
import { Button } from './ui/button'
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface LogoUploadProps {
  currentLogo?: string | null
  onUpload: (logoUrl: string) => Promise<void>
  entityId: string
  entityName: string
  getPresignedUrl: (params: { fileName: string; fileType: string; fileSize?: number }) => Promise<{ presignedUrl: string; fileKey: string; fileName: string; fileType: string }>
}

export function LogoUpload({ currentLogo, onUpload, entityId: _entityId, entityName, getPresignedUrl }: LogoUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(currentLogo || null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB')
      return
    }

    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreview(reader.result as string)
    }
    reader.readAsDataURL(file)

    // Upload to S3
    setIsUploading(true)
    try {
      // Get presigned URL
      const { presignedUrl, fileKey } = await getPresignedUrl({
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      })

      // Upload to S3
      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      })

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload image to storage')
      }

      // Construct the file URL from S3 endpoint and file key
      // The file URL should be: S3_ENDPOINT/S3_BUCKET/fileKey
      const s3Endpoint = import.meta.env.VITE_S3_ENDPOINT || 'http://localhost:9000'
      const s3Bucket = import.meta.env.VITE_S3_BUCKET || 'supplify'
      const fileUrl = `${s3Endpoint}/${s3Bucket}/${fileKey}`

      // Save logo URL to database
      await onUpload(fileUrl)

      toast.success('Logo uploaded successfully!')
    } catch (error: any) {
      console.error('Logo upload error:', error)
      toast.error(error?.message || 'Failed to upload logo')
      setPreview(currentLogo || null)
    } finally {
      setIsUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemove = async () => {
    try {
      await onUpload('') // Empty string removes the logo
      setPreview(null)
      toast.success('Logo removed successfully!')
    } catch (error: any) {
      console.error('Logo remove error:', error)
      toast.error(error?.message || 'Failed to remove logo')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="w-32 h-32 rounded-lg border-2 border-[var(--app-border-mid)] flex items-center justify-center bg-[var(--brand-ultra)] overflow-hidden">
            {preview ? (
              <img
                src={preview}
                alt={`${entityName} logo`}
                className="w-full h-full object-cover"
              />
            ) : (
              <ImageIcon className="w-12 h-12 text-[var(--text-muted)]" />
            )}
          </div>
          {isUploading && (
            <div className="absolute inset-0 bg-black bg-opacity-50 rounded-lg flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full sm:w-auto"
            >
              <Upload className="h-4 w-4 mr-2" />
              {currentLogo ? 'Change Logo' : 'Upload Logo'}
            </Button>
            {currentLogo && (
              <Button
                type="button"
                variant="outline"
                onClick={handleRemove}
                disabled={isUploading}
                className="w-full sm:w-auto"
              >
                <X className="h-4 w-4 mr-2" />
                Remove Logo
              </Button>
            )}
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            Recommended: Square image, at least 200x200px. Max size: 5MB
          </p>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  )
}

