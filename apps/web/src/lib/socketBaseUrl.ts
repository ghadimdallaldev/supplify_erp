/** Socket.IO base URL — direct to the API in dev to avoid Vite ws-proxy noise on hot reload. */
export function getSocketBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.replace(/\/$/, '')
  if (configured) return configured
  if (import.meta.env.DEV) return 'http://localhost:4000'
  if (typeof window !== 'undefined') return window.location.origin
  return 'http://localhost:4000'
}
