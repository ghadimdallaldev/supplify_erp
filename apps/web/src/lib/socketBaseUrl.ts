/**
 * Socket.IO base URL.
 * In the browser without VITE_API_URL, use the page origin so dev traffic goes through
 * Vite's /socket.io proxy (same as /api). OAuth and explicit VITE_API_URL still target the API host.
 */
export function getSocketBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.replace(/\/$/, '')
  if (configured) return configured
  if (typeof window !== 'undefined') return window.location.origin
  return 'http://localhost:4000'
}
