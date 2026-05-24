import type { Socket } from 'socket.io-client'

/** Refresh session cookies via REST (triggers token refresh when access token expired). */
async function refreshSessionCookies(): Promise<void> {
  await fetch('/auth/me', { credentials: 'include' })
}

/**
 * Connect a socket after ensuring auth cookies are valid.
 * Retries once after /auth/me when the handshake fails with Unauthorized.
 */
export function connectAuthenticatedSocket(socket: Socket, logPrefix: string): void {
  let authRetryDone = false

  socket.on('connect_error', (err) => {
    const msg = err.message || ''
    const unauthorized = msg.toLowerCase().includes('unauthorized')

    if (!unauthorized || authRetryDone) {
      if (import.meta.env.DEV && unauthorized) {
        console.debug(`[${logPrefix}] still unauthorized after retry`)
      }
      return
    }

    authRetryDone = true
    void refreshSessionCookies()
      .then(() => {
        if (!socket.connected) socket.connect()
      })
      .catch(() => {})
  })

  void refreshSessionCookies()
    .then(() => {
      if (!socket.connected) socket.connect()
    })
    .catch(() => {
      if (!socket.connected) socket.connect()
    })
}
