import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ReservationReview } from '../../types'
import {
  useGetReservationReviewsQuery,
  useReplyToReservationReviewMutation,
} from '../../services/reservationsApi'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Textarea } from '../ui/textarea'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import { toast } from 'sonner'

function ReviewRow({ review }: { review: ReservationReview }) {
  const { t } = useTranslation('reservations')
  const [reply, setReply] = useState(review.staff_reply || '')
  const [sendReply, { isLoading }] = useReplyToReservationReviewMutation()

  const handleReply = async () => {
    if (!reply.trim()) return
    try {
      await sendReply({ id: review.id, reply: reply.trim() }).unwrap()
      toast.success(t('reviews.replySaved'))
    } catch {
      toast.error(t('reviews.replyFailed'))
    }
  }

  return (
    <div className="rounded-xl border border-[var(--app-border)] bg-[var(--brand-ultra)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-[var(--text)]">
          {review.customer_name || review.reviewer_name}
        </p>
        <Badge variant="outline">{t('reviews.overall', { rating: review.overall_rating })}</Badge>
        {review.party_size ? (
          <span className="text-xs text-[var(--text-muted)]">
            {t('reviews.party', { count: review.party_size })}
          </span>
        ) : null}
      </div>
      {review.comment ? <p className="mt-2 text-sm text-[var(--text)]">{review.comment}</p> : null}
      {review.staff_reply ? (
        <p className="mt-2 text-sm text-[var(--mint)]">{review.staff_reply}</p>
      ) : (
        <div className="mt-3 space-y-2">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={t('reviews.replyPlaceholder')}
            className="min-h-[72px]"
          />
          <Button size="sm" onClick={handleReply} disabled={isLoading || !reply.trim()}>
            {isLoading ? t('reviews.replying') : t('reviews.reply')}
          </Button>
        </div>
      )}
    </div>
  )
}

export function ReservationReviewsPanel() {
  const { t } = useTranslation('reservations')
  const { data, isLoading } = useGetReservationReviewsQuery()
  const reviews = data?.reviews ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('reviews.title')}</CardTitle>
        <CardDescription>{t('reviews.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <Skeleton className="h-24 w-full" /> : null}
        {!isLoading && reviews.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t('reviews.empty')}</p>
        ) : null}
        {reviews.map((review) => (
          <ReviewRow key={review.id} review={review} />
        ))}
      </CardContent>
    </Card>
  )
}
