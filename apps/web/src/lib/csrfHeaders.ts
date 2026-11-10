/**
 * Header the API's csrfProtection middleware requires on every cookie-authenticated
 * write (alongside an allowed Origin). The RTK base query sets it for you; raw `fetch`
 * writes must spread this into their headers.
 */
export const CSRF_HEADERS = { 'X-Requested-With': 'Supplify' } as const
