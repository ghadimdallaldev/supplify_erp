/* eslint-disable no-restricted-globals */
self.addEventListener('push', (event) => {
  let payload = { title: 'Supplify', body: 'You have a new notification', url: '/' }
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() }
    }
  } catch {
    payload.body = event.data?.text() || payload.body
  }

  const title = payload.title || 'Supplify'
  const body = payload.body || ''
  const url = payload.url || '/app/notifications'

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: payload.referenceId
          ? `supplify-${payload.referenceType}-${payload.referenceId}`
          : undefined,
        data: { url },
        vibrate: [120, 60, 120],
        silent: false,
      })
      // Best-effort auto-dismiss (~10s) for background push banners.
      await new Promise((resolve) => setTimeout(resolve, 10_000))
      const notifications = await self.registration.getNotifications({
        tag: payload.referenceId
          ? `supplify-${payload.referenceType}-${payload.referenceId}`
          : undefined,
      })
      for (const n of notifications) {
        if (n.title === title) n.close()
      }
    })()
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    })
  )
})
