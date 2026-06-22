import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Camera, Eraser } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import {
  usePresignOrderProofOfDeliveryMutation,
  useSubmitOrderProofOfDeliveryMutation,
} from '../../services/api'

type Props = {
  open: boolean
  orderId: string | null
  onOpenChange: (open: boolean) => void
  onSubmitted?: () => void
}

async function uploadPresignedFile(
  presign: {
    presignedUrl?: string
    url?: string
    fileKey: string
  },
  file: Blob,
  fileType: string
) {
  const uploadUrl = presign.presignedUrl || presign.url
  if (!uploadUrl) throw new Error('No upload URL returned')
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': fileType },
  })
  if (!response.ok) throw new Error('Failed to upload file')
  return presign.fileKey
}

export function ProofOfDeliveryDialog({ open, orderId, onOpenChange, onSubmitted }: Props) {
  const { t } = useTranslation('fulfillment')
  const [recipientName, setRecipientName] = useState('')
  const [notes, setNotes] = useState('')
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [includeGps, setIncludeGps] = useState(true)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [presignPod] = usePresignOrderProofOfDeliveryMutation()
  const [submitPod, { isLoading: submitting }] = useSubmitOrderProofOfDeliveryMutation()

  const resetForm = useCallback(() => {
    setRecipientName('')
    setNotes('')
    setPhotoPreview(null)
    setPhotoFile(null)
    setIncludeGps(true)
    setHasSignature(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
    }
  }, [])

  useEffect(() => {
    if (!open) {
      resetForm()
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [open, resetForm])

  const getCanvasPoint = (event: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in event) {
      const touch = event.touches[0] ?? event.changedTouches[0]
      if (!touch) return null
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    }
  }

  const startDrawing = (event: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const point = getCanvasPoint(event)
    if (!canvas || !ctx || !point) return
    setIsDrawing(true)
    setHasSignature(true)
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
  }

  const draw = (event: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const point = getCanvasPoint(event)
    if (!canvas || !ctx || !point) return
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
  }

  const endDrawing = () => setIsDrawing(false)

  const clearSignature = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  const handlePhotoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error(t('pod.toast.selectImage'))
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t('pod.toast.imageTooLarge'))
      return
    }
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onloadend = () => setPhotoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleSubmit = async () => {
    if (!orderId) return
    try {
      let fileKey: string | undefined
      let signatureFileKey: string | undefined

      if (photoFile) {
        const presigned = await presignPod({
          orderId,
          fileName: photoFile.name,
          fileType: photoFile.type,
          fileSize: photoFile.size,
        }).unwrap()
        fileKey = await uploadPresignedFile(presigned, photoFile, photoFile.type)
      }

      if (hasSignature && canvasRef.current) {
        const signatureBlob = await new Promise<Blob | null>((resolve) => {
          canvasRef.current?.toBlob((blob) => resolve(blob), 'image/png')
        })
        if (signatureBlob) {
          const presigned = await presignPod({
            orderId,
            fileName: 'signature.png',
            fileType: 'image/png',
            fileSize: signatureBlob.size,
          }).unwrap()
          signatureFileKey = await uploadPresignedFile(presigned, signatureBlob, 'image/png')
        }
      }

      let latitude: number | undefined
      let longitude: number | undefined
      if (includeGps && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10_000,
              maximumAge: 60_000,
            })
          })
          latitude = pos.coords.latitude
          longitude = pos.coords.longitude
        } catch {
          /* GPS optional */
        }
      }

      await submitPod({
        orderId,
        recipient_name: recipientName || undefined,
        notes: notes || undefined,
        file_key: fileKey,
        signature_file_key: signatureFileKey,
        latitude,
        longitude,
      }).unwrap()

      toast.success(t('pod.toast.saved'))
      onOpenChange(false)
      onSubmitted?.()
    } catch (error: unknown) {
      const msg = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || t('pod.toast.saveFailed'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('pod.dialog.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="pod-photo">{t('pod.dialog.deliveryPhotoLabel')}</Label>
            <div className="mt-2 flex flex-wrap items-start gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="mr-2 h-4 w-4" />
                {photoFile ? t('pod.dialog.changePhoto') : t('pod.dialog.addPhoto')}
              </Button>
              <input
                ref={fileInputRef}
                id="pod-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePhotoSelect}
              />
              {photoPreview && (
                <img
                  src={photoPreview}
                  alt={t('pod.dialog.photoPreviewAlt')}
                  className="h-24 w-24 rounded-lg border border-[var(--app-border)] object-cover"
                />
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <Label>{t('pod.dialog.recipientSignature')}</Label>
              <Button type="button" variant="ghost" size="sm" onClick={clearSignature}>
                <Eraser className="mr-1 h-3 w-3" />
                {t('pod.dialog.clear')}
              </Button>
            </div>
            <canvas
              ref={canvasRef}
              width={480}
              height={160}
              className="mt-2 w-full rounded-lg border border-[var(--app-border)] touch-none bg-white"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={endDrawing}
              onMouseLeave={endDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={endDrawing}
            />
          </div>

          <div>
            <Label htmlFor="pod-recipient">{t('pod.dialog.recipientName')}</Label>
            <Input
              id="pod-recipient"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="pod-notes">{t('pod.dialog.notes')}</Label>
            <Textarea
              id="pod-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--text-mid)]">
            <input
              type="checkbox"
              checked={includeGps}
              onChange={(e) => setIncludeGps(e.target.checked)}
              className="rounded border-[var(--app-border)]"
            />
            {t('pod.dialog.includeGps')}
          </label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('pod.dialog.skip')}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('pod.dialog.saveProof')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
