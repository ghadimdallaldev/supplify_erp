import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Trans } from 'react-i18next'
import { legalDocumentPath } from '../../lib/legalDocuments'
import { ensureNamespace } from '../../i18n'

const linkClass = 'text-[var(--brand-mid)] hover:underline'

export function LegalFooterLinks({ className = '' }: { className?: string }) {
  useEffect(() => {
    void ensureNamespace('legal')
  }, [])

  return (
    <p className={`text-center text-xs text-[var(--text-muted)] ${className}`}>
      <Trans
        i18nKey="hub.footerAgreement"
        ns="legal"
        defaults="By using Supplify, you agree to our <terms>Terms</terms>, <privacy>Privacy Policy</privacy>, and <legal>other legal agreements</legal>."
        components={{
          terms: <Link to={legalDocumentPath('terms_and_conditions')} className={linkClass} />,
          privacy: <Link to={legalDocumentPath('privacy_policy')} className={linkClass} />,
          legal: <Link to="/legal" className={linkClass} />,
        }}
      />
    </p>
  )
}
