import type { LegalAcceptanceStatus, User } from '../types'

export function needsLegalReacceptance(user: User | null | undefined): boolean {
  return Boolean(user && user.role !== 'PENDING' && user.legalStatus?.needsReacceptance)
}

export function isLegalReacceptanceSatisfied(
  legalStatus: LegalAcceptanceStatus | null | undefined
): boolean {
  return Boolean(legalStatus && !legalStatus.needsReacceptance)
}
