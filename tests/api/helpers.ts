/**
 * Soft unauthorized assertion for hosted API (cookie CSRF may return 403 before 401).
 */
export function expectUnauthorizedStatus(status: number): void {
  if (status !== 401 && status !== 403) {
    throw new Error(`Expected unauthorized 401/403, got ${status}`)
  }
}
