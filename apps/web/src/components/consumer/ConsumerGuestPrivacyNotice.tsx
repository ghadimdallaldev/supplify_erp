import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Trans } from 'react-i18next'
import { legalDocumentPath } from '../../lib/legalDocuments'
import { ensureNamespace } from '../../i18n'

const linkClass = 'text-[var(--brand-mid)] underline-offset-2 hover:underline'

type Props = {
  restaurantName?: string | null
  className?: string
}

export function ConsumerGuestPrivacyNotice({ restaurantName, className = '' }: Props) {
  useEffect(() => {
    void ensureNamespace('legal')
  }, [])

  const name = restaurantName?.trim() || 'this restaurant'

  return (
    <p className={`text-xs leading-relaxed text-muted-foreground ${className}`}>
      <Trans
        i18nKey="consumerGuestOrder.notice"
        ns="legal"
        values={{ restaurantName: name }}
        defaults="By placing this order, you agree that {{restaurantName}} may use your contact and order details to prepare and fulfill your order. Supplify provides the ordering software. Read Supplify’s <privacy>Privacy Policy</privacy> and <terms>Terms</terms>."
        components={{
          privacy: <Link to={legalDocumentPath('privacy_policy')} className={linkClass} />,
          terms: <Link to={legalDocumentPath('terms_and_conditions')} className={linkClass} />,
        }}
      />
    </p>
  )
}
