import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'

type DeclineOrderDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string) => Promise<void>
  orderLabel?: string
  isSubmitting?: boolean
}

export function DeclineOrderDialog({
  open,
  onOpenChange,
  onConfirm,
  orderLabel,
  isSubmitting = false,
}: DeclineOrderDialogProps) {
  const { t } = useTranslation('orders')
  const [reason, setReason] = useState('')

  const handleClose = (next: boolean) => {
    if (!isSubmitting) {
      onOpenChange(next)
      if (!next) setReason('')
    }
  }

  const handleSubmit = async () => {
    const trimmed = reason.trim()
    if (trimmed.length < 3) return
    await onConfirm(trimmed)
    setReason('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('declineDialog.title')}</DialogTitle>
          <DialogDescription>
            {orderLabel
              ? t('declineDialog.descriptionWithLabel', { label: orderLabel })
              : t('declineDialog.descriptionGeneric')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="decline-reason">{t('declineDialog.reasonLabel')}</Label>
          <Textarea
            id="decline-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('declineDialog.reasonPlaceholder')}
            rows={4}
            maxLength={2000}
            disabled={isSubmitting}
          />
          <p className="text-xs text-[var(--text-muted)]">{t('declineDialog.minChars')}</p>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isSubmitting}
          >
            {t('declineDialog.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || reason.trim().length < 3}
          >
            {isSubmitting ? t('declineDialog.declining') : t('declineDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
