import { CheckCircle, ImageIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGetOrderProofOfDeliveryQuery } from '../../services/api'
import { resolvePodMediaUrl } from '../../lib/podMediaUrl'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'

type Props = {
  orderId: string
}

export function OrderProofOfDeliveryPanel({ orderId }: Props) {
  const { t } = useTranslation('fulfillment')
  const { data, isLoading, isError } = useGetOrderProofOfDeliveryQuery(orderId)

  if (isLoading) {
    return <Skeleton className="h-40 w-full rounded-xl" />
  }

  if (isError) return null

  const proof = data?.proof
  if (!proof) return null

  const photoUrl = resolvePodMediaUrl(proof, 'photo')
  const signatureUrl = resolvePodMediaUrl(proof, 'signature')

  return (
    <Card data-testid="order-pod-panel">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle className="h-5 w-5 text-[var(--mint)]" />
          {t('pod.title')}
          {proof.confirmed_at && (
            <Badge variant="outline" className="border-[var(--mint)] text-[var(--mint)]">
              {t('pod.restaurantConfirmed')}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {photoUrl ? (
            <div>
              <p className="mb-2 text-sm font-medium text-[var(--text-muted)]">
                {t('pod.deliveryPhoto')}
              </p>
              <a href={photoUrl} target="_blank" rel="noopener noreferrer">
                <img
                  src={photoUrl}
                  alt={t('pod.deliveryPhotoAlt')}
                  className="max-h-48 rounded-lg border border-[var(--app-border)] object-cover"
                />
              </a>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <ImageIcon className="h-4 w-4" />
              {t('pod.noDeliveryPhoto')}
            </div>
          )}
          {signatureUrl ? (
            <div>
              <p className="mb-2 text-sm font-medium text-[var(--text-muted)]">
                {t('pod.signature')}
              </p>
              <a href={signatureUrl} target="_blank" rel="noopener noreferrer">
                <img
                  src={signatureUrl}
                  alt={t('pod.signatureAlt')}
                  className="max-h-32 rounded-lg border border-[var(--app-border)] bg-white object-contain"
                />
              </a>
            </div>
          ) : null}
        </div>

        {proof.recipient_name && (
          <p className="text-sm">
            <span className="text-[var(--text-muted)]">{t('pod.recipient')} </span>
            {proof.recipient_name}
          </p>
        )}
        {proof.notes && (
          <p className="text-sm text-[var(--text-mid)] whitespace-pre-wrap">{proof.notes}</p>
        )}
        {proof.delivery_timestamp && (
          <p className="text-xs text-[var(--text-muted)]">
            {t('pod.recorded', { date: new Date(proof.delivery_timestamp).toLocaleString() })}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
