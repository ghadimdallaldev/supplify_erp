import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Shield, FileText, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import {
  LEGAL_DOCUMENTS,
  LEGAL_PACK_VERSION,
  type LegalDocumentSlug,
  legalDocumentPath,
  legalDocumentTitleKey,
  legalDocumentShortTitleKey,
  requiredInviteSlugs,
  requiredRegistrationSlugs,
} from '../../lib/legalDocuments'

type Props = {
  variant: 'registration' | 'invite'
  accountType?: 'RESTAURANT' | 'SUPPLIER' | null
  value: Set<LegalDocumentSlug>
  onChange: (next: Set<LegalDocumentSlug>) => void
  electronicSigned: boolean
  onElectronicSignedChange: (signed: boolean) => void
  disabled?: boolean
}

type AttestationKey = 'platform' | 'role' | 'policies' | 'mobile'

function toggle(set: Set<LegalDocumentSlug>, slug: LegalDocumentSlug, on: boolean) {
  const next = new Set(set)
  if (on) next.add(slug)
  else next.delete(slug)
  return next
}

export function LegalAcceptancePanel({
  variant,
  accountType,
  value,
  onChange,
  electronicSigned,
  onElectronicSignedChange,
  disabled,
}: Props) {
  const { t } = useTranslation('legal')
  const [expanded, setExpanded] = useState(true)

  const requiredSlugs = useMemo(() => {
    if (variant === 'invite') return requiredInviteSlugs()
    if (!accountType) return []
    return requiredRegistrationSlugs(accountType)
  }, [variant, accountType])

  const roleDoc = accountType === 'SUPPLIER' ? 'supplier_agreement' : 'restaurant_agreement'

  const platformOk = value.has('terms_and_conditions') && value.has('privacy_policy')
  const policiesOk =
    value.has('acceptable_use_policy') &&
    value.has('data_processing_addendum') &&
    value.has('cookie_policy')
  const roleOk = variant === 'invite' || !accountType || value.has(roleDoc)
  const mobileOk = variant === 'registration' ? value.has('mobile_app_terms') : true

  const allRequiredAccepted = requiredSlugs.length > 0 && requiredSlugs.every((s) => value.has(s))
  const canSubmit = allRequiredAccepted && electronicSigned

  const setAttestation = (key: AttestationKey, checked: boolean) => {
    if (key === 'platform') {
      let next = new Set(value)
      next = toggle(next, 'terms_and_conditions', checked)
      next = toggle(next, 'privacy_policy', checked)
      onChange(next)
      return
    }
    if (key === 'policies') {
      let next = new Set(value)
      next = toggle(next, 'acceptable_use_policy', checked)
      next = toggle(next, 'data_processing_addendum', checked)
      next = toggle(next, 'cookie_policy', checked)
      onChange(next)
      return
    }
    if (key === 'role' && variant === 'registration' && accountType) {
      onChange(toggle(value, roleDoc, checked))
      return
    }
    if (key === 'mobile' && variant === 'registration') {
      onChange(toggle(value, 'mobile_app_terms', checked))
    }
  }

  const checkboxesDisabled = disabled || (variant === 'registration' && !accountType)

  return (
    <div
      data-testid="legal-acceptance-panel"
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] shadow-sm overflow-hidden"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand-pale)]">
            <Shield className="h-5 w-5 text-[var(--brand-mid)]" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-semibold text-[var(--text)]">Legal agreements</span>
            <span className="block text-xs text-[var(--text-muted)]">
              Required before creating your account · Pack {LEGAL_PACK_VERSION}
            </span>
          </span>
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        )}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-[var(--app-border)] px-4 py-4 sm:px-5">
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            By checking the boxes below, you confirm that you have read, understand, and agree to be
            bound by the linked agreements on behalf of the business you represent. This constitutes
            your electronic signature under applicable e-signature laws.
          </p>

          <ul className="space-y-1.5 text-xs text-[var(--text-muted)]">
            {requiredSlugs.map((slug) => (
              <li key={slug} className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <Link
                  to={legalDocumentPath(slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[var(--brand-mid)] hover:underline inline-flex items-center gap-1"
                >
                  {t(legalDocumentTitleKey(slug))}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--app-border)] p-3 has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--brand-pale)]/40">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--app-border)]"
                checked={platformOk}
                disabled={checkboxesDisabled}
                onChange={(e) => setAttestation('platform', e.target.checked)}
                data-testid="legal-accept-platform"
              />
              <span className="text-sm text-[var(--text)]">
                I agree to the <DocLink slug="terms_and_conditions" /> and{' '}
                <DocLink slug="privacy_policy" />.
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--app-border)] p-3 has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--brand-pale)]/40">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--app-border)]"
                checked={policiesOk}
                disabled={checkboxesDisabled}
                onChange={(e) => setAttestation('policies', e.target.checked)}
                data-testid="legal-accept-policies"
              />
              <span className="text-sm text-[var(--text)]">
                I agree to the <DocLink slug="acceptable_use_policy" />,{' '}
                <DocLink slug="data_processing_addendum" />, and <DocLink slug="cookie_policy" />.
              </span>
            </label>

            {variant === 'registration' && accountType && (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--app-border)] p-3 has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--brand-pale)]/40">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--app-border)]"
                  checked={roleOk}
                  disabled={disabled}
                  onChange={(e) => setAttestation('role', e.target.checked)}
                  data-testid="legal-accept-role"
                />
                <span className="text-sm text-[var(--text)]">
                  I agree to the <DocLink slug={roleDoc} /> for my organization type.
                </span>
              </label>
            )}

            {variant === 'registration' && (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--app-border)] p-3 has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--brand-pale)]/40">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--app-border)]"
                  checked={mobileOk}
                  disabled={checkboxesDisabled}
                  onChange={(e) => setAttestation('mobile', e.target.checked)}
                  data-testid="legal-accept-mobile"
                />
                <span className="text-sm text-[var(--text)]">
                  I agree to the <DocLink slug="mobile_app_terms" /> (including mobile web and
                  installable app use).
                </span>
              </label>
            )}

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border-2 border-[var(--brand)]/30 bg-[var(--brand-ultra)] p-3 has-[:checked]:border-[var(--brand)]">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--app-border)]"
                checked={electronicSigned}
                disabled={disabled}
                onChange={(e) => onElectronicSignedChange(e.target.checked)}
                data-testid="legal-accept-electronic"
              />
              <span className="text-sm font-medium text-[var(--text)]">
                I confirm I am authorized to bind my organization and consent to electronic
                signature of these agreements.
              </span>
            </label>
          </div>

          {!canSubmit && (accountType || variant === 'invite') && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Accept all required agreements above to continue.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function isLegalAcceptanceComplete(
  variant: 'registration' | 'invite',
  accountType: 'RESTAURANT' | 'SUPPLIER' | null,
  accepted: Set<LegalDocumentSlug>,
  electronicSigned: boolean
): boolean {
  const required =
    variant === 'invite'
      ? requiredInviteSlugs()
      : accountType
        ? requiredRegistrationSlugs(accountType)
        : []
  return electronicSigned && required.every((s) => accepted.has(s))
}

function DocLink({ slug }: { slug: LegalDocumentSlug }) {
  const { t } = useTranslation('legal')
  return (
    <Link
      to={legalDocumentPath(slug)}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-[var(--brand-mid)] hover:underline inline-flex items-center gap-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      {t(legalDocumentShortTitleKey(slug))}
      <ExternalLink className="h-3 w-3" aria-hidden />
    </Link>
  )
}
