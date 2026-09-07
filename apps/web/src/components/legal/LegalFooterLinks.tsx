import { Link } from 'react-router-dom'
import { Trans } from 'react-i18next'
import { legalDocumentPath } from '../../lib/legalDocuments'

const linkClass = 'text-[var(--brand-mid)] hover:underline'

export function LegalFooterLinks({ className = '' }: { className?: string }) {
  return (
    <p className={`text-center text-xs text-[var(--text-muted)] ${className}`}>
      <Trans
        i18nKey="hub.footerAgreement"
        ns="legal"
        components={{
          terms: <Link to={legalDocumentPath('terms_and_conditions')} className={linkClass} />,
          privacy: <Link to={legalDocumentPath('privacy_policy')} className={linkClass} />,
          legal: <Link to="/legal" className={linkClass} />,
        }}
      />
    </p>
  )
}
