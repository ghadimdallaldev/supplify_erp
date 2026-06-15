const REFERRAL_TOKEN_KEY = 'supplify.referralToken'

export function storeReferralToken(token: string): void {
  try {
    sessionStorage.setItem(REFERRAL_TOKEN_KEY, token)
  } catch {
    // ignore quota / private mode
  }
}

export function peekReferralToken(): string | undefined {
  try {
    return sessionStorage.getItem(REFERRAL_TOKEN_KEY) || undefined
  } catch {
    return undefined
  }
}

export function clearReferralToken(): void {
  try {
    sessionStorage.removeItem(REFERRAL_TOKEN_KEY)
  } catch {
    // ignore
  }
}

export function getRegisterCompletePath(): string {
  const ref = peekReferralToken()
  return ref ? `/register/complete?ref=${encodeURIComponent(ref)}` : '/register/complete'
}
