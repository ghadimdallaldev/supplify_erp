/** Socket.IO base URL — Vite proxies /socket.io to the API in dev when unset. */
export function getSocketBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.replace(/\/$/, '')
  if (configured) return configured
  if (typeof window !== 'undefined') return window.location.origin
  return 'http://localhost:4000'
}
