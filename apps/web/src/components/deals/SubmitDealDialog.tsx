import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { DealBoostPackagePicker } from './DealBoostPackagePicker'
import { useSubmitPromotionMutation } from '../../services/api'
import { ensureNamespace } from '../../i18n'
import { Send } from 'lucide-react'
import { toast } from 'sonner'

export function SubmitDealDialog({
  dealId,
  dealName,
  open,
  onOpenChange,
  onSuccess,
}: {
  dealId: string | null
  dealName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}) {
  const { t } = useTranslation('deals')
  const [pricingKey, setPricingKey] = useState('')
  const [submitDeal, { isLoading }] = useSubmitPromotionMutation()

  useEffect(() => {
    void ensureNamespace('deals')
  }, [])

  const handleSubmit = async () => {
    if (!dealId || !pricingKey) {
      toast.error(t('submitDialog.toastSelectPackage'))
      return
    }
    try {
      await submitDeal({ id: dealId, pricingKey }).unwrap()
      toast.success(t('submitDialog.toastSuccess'))
      onOpenChange(false)
      onSuccess?.()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('submitDialog.toastError'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t('submitDialog.title')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[var(--text-muted)]">
          {dealName
            ? t('submitDialog.descriptionWithName', { name: dealName })
            : t('submitDialog.description')}
        </p>
        <DealBoostPackagePicker selectedPricingKey={pricingKey} onSelect={setPricingKey} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('submitDialog.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !pricingKey}>
            <Send className="h-4 w-4 me-2" />
            {t('submitDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
