import { Link } from 'react-router-dom'
import { legalDocumentPath } from '../../lib/legalDocuments'

export function LegalFooterLinks({ className = '' }: { className?: string }) {
  return (
    <p className={`text-center text-xs text-[var(--text-muted)] ${className}`}>
      By using Supplify, you agree to our{' '}
      <Link
        to={legalDocumentPath('terms_and_conditions')}
        className="text-[var(--brand-mid)] hover:underline"
      >
        Terms
      </Link>
      ,{' '}
      <Link
        to={legalDocumentPath('privacy_policy')}
        className="text-[var(--brand-mid)] hover:underline"
      >
        Privacy Policy
      </Link>
      , and{' '}
      <Link to="/legal" className="text-[var(--brand-mid)] hover:underline">
        other legal agreements
      </Link>
      .
    </p>
  )
}
