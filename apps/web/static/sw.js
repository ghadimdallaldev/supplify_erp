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

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Supplify', {
      body: payload.body || '',
      icon: '/favicon.ico',
      data: { url: payload.url || '/' },
    })
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
