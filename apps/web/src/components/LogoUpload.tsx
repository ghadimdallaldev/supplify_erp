import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface LogoUploadProps {
  currentLogo?: string | null
  onUpload: (logoUrl: string) => Promise<void>
  entityId: string
  entityName: string
  getPresignedUrl: (params: { fileName: string; fileType: string; fileSize?: number }) => Promise<{
    presignedUrl: string
    publicUrl?: string
    fileKey: string
    fileName: string
    fileType: string
  }>
  uploadLabel?: string
  changeLabel?: string
  removeLabel?: string
  helperText?: string
  previewAlt?: string
  previewClassName?: string
}

export function LogoUpload({
  currentLogo,
  onUpload,
  entityId: _entityId,
  entityName,
  getPresignedUrl,
  uploadLabel = 'Upload Logo',
  changeLabel = 'Change Logo',
  removeLabel = 'Remove Logo',
  helperText = 'Recommended: Square image, at least 200x200px. Max size: 5MB',
  previewAlt,
  previewClassName = 'w-32 h-32',
}: LogoUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(currentLogo || null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setPreview(currentLogo || null)
  }, [currentLogo])

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

    setIsUploading(true)
    let fileUrl: string
    try {
      const { presignedUrl, publicUrl } = await getPresignedUrl({
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      })

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

      if (!publicUrl) {
        throw new Error('Upload succeeded but no public URL was returned')
      }
      fileUrl = publicUrl
    } catch (error: unknown) {
      console.error('Logo upload error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to upload logo')
      setPreview(currentLogo || null)
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    try {
      await onUpload(fileUrl)
      toast.success('Image uploaded successfully!')
    } catch (error: unknown) {
      console.error('Logo save error:', error)
      setPreview(currentLogo || null)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemove = async () => {
    try {
      await onUpload('') // Empty string removes the logo
      setPreview(null)
      toast.success('Image removed successfully!')
    } catch (error: unknown) {
      console.error('Logo remove error:', error)
      setPreview(currentLogo || null)
      throw error
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="relative">
          <div
            className={`${previewClassName} rounded-lg border-2 border-[var(--app-border-mid)] flex items-center justify-center bg-[var(--brand-ultra)] overflow-hidden`}
          >
            {preview ? (
              <img
                src={preview}
                alt={previewAlt ?? `${entityName} logo`}
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
              {currentLogo ? changeLabel : uploadLabel}
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
                {removeLabel}
              </Button>
            )}
          </div>
          <p className="text-sm text-[var(--text-muted)]">{helperText}</p>
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
