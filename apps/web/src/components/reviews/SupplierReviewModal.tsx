import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useCreateSupplierReviewMutation,
  useGetMyReviewsQuery,
  useGetOrdersQuery,
  useUpdateReviewMutation,
} from '../../services/api'
import { isOrderEligibleForReview } from '../../lib/orderReviewEligibility'
import { formatOrderRef } from '../../lib/orderPlacement'
import { formatPrice } from '../../utils/format'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger } from '../ui/select'
import { toast } from 'sonner'
import { ensureNamespace } from '../../i18n'

export type SupplierReviewEditTarget = {
  id: string
  overall_rating: number
  comment?: string | null
}

type Props = {
  supplierId: string
  supplierName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  initialOrderId?: string
  editingReview?: SupplierReviewEditTarget | null
  onSuccess?: () => void
}

export function SupplierReviewModal({
  supplierId,
  supplierName,
  open,
  onOpenChange,
  initialOrderId,
  editingReview,
  onSuccess,
}: Props) {
  const { t } = useTranslation('suppliers')
  const isEdit = Boolean(editingReview?.id)
  const [orderId, setOrderId] = useState('')
  const [overallRating, setOverallRating] = useState(5)
  const [comment, setComment] = useState('')

  const { data: ordersData } = useGetOrdersQuery(
    { limit: 100, offset: 0 },
    { skip: !open || isEdit }
  )
  const { data: myReviewsData } = useGetMyReviewsQuery(undefined, { skip: !open || isEdit })
  const [createReview, { isLoading: creating }] = useCreateSupplierReviewMutation()
  const [updateReview, { isLoading: updating }] = useUpdateReviewMutation()

  useEffect(() => {
    void ensureNamespace('suppliers')
  }, [])

  const reviewedOrderIds = useMemo(
    () => new Set((myReviewsData?.reviews ?? []).map((r) => String(r.order_id))),
    [myReviewsData]
  )

  const orderOptions = useMemo(() => {
    return (ordersData?.orders ?? [])
      .filter((o) => isOrderEligibleForReview(o.status))
      .filter((o) => !reviewedOrderIds.has(o.id))
      .map((o) => ({
        id: o.id,
        label: `${formatOrderRef(o.id)} — ${String(o.status).replace(/_/g, ' ')} — ${new Date(o.placed_at || o.created_at).toLocaleDateString()} — $${formatPrice(Number(o.total_amount || 0))}`,
      }))
  }, [ordersData, reviewedOrderIds])

  useEffect(() => {
    if (!open) return
    if (editingReview) {
      setOverallRating(Number(editingReview.overall_rating) || 5)
      setComment(editingReview.comment ? String(editingReview.comment) : '')
      return
    }
    setOrderId(initialOrderId || '')
    setOverallRating(5)
    setComment('')
  }, [open, editingReview, initialOrderId])

  useEffect(() => {
    if (!open || isEdit || initialOrderId) return
    if (orderOptions.length === 1) {
      setOrderId(orderOptions[0].id)
    }
  }, [open, isEdit, initialOrderId, orderOptions])

  const submitting = creating || updating

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit review' : `Review ${supplierName}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!isEdit && (
            <div>
              <Label>Order</Label>
              <Select value={orderId} onValueChange={setOrderId}>
                <SelectTrigger placeholder="Select a completed order">
                  <SelectContent>
                    {orderOptions.length === 0 ? (
                      <SelectItem value="__none__" disabled>
                        No eligible orders
                      </SelectItem>
                    ) : (
                      orderOptions.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </SelectTrigger>
              </Select>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Only delivered orders without an existing review are shown.
              </p>
            </div>
          )}
          <div>
            <Label>Rating</Label>
            <Select
              value={String(overallRating)}
              onValueChange={(v) => setOverallRating(Number(v))}
            >
              <SelectTrigger>
                <SelectContent>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} stars
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectTrigger>
            </Select>
          </div>
          <div>
            <Label>Comment</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={submitting}
            onClick={async () => {
              try {
                if (isEdit && editingReview) {
                  await updateReview({
                    id: editingReview.id,
                    body: {
                      overallRating,
                      comment: comment || null,
                    },
                  }).unwrap()
                  toast.success(t('reviewModal.toast.updated'))
                } else {
                  if (!orderId || orderId === '__none__') {
                    toast.error(t('reviewModal.toast.selectOrder'))
                    return
                  }
                  await createReview({
                    supplierId,
                    body: {
                      orderId,
                      overallRating,
                      comment: comment || null,
                    },
                  }).unwrap()
                  toast.success(t('reviewModal.toast.submitted'))
                }
                onOpenChange(false)
                onSuccess?.()
              } catch (e: unknown) {
                const err = e as { data?: { error?: { message?: string } } }
                toast.error(err?.data?.error?.message || t('reviewModal.toast.saveFailed'))
              }
            }}
          >
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
