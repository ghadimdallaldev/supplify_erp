/* eslint-disable no-restricted-globals */
/** @type {string} */
const CACHE_VERSION = 'supplify-static-v2'
/** @type {string[]} */
const PRECACHE_URLS = [
  '/offline.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
]

function isSensitiveRequest(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/socket.io/')
  )
}

function isStaticAssetRequest(url, request) {
  if (PRECACHE_URLS.includes(url.pathname)) return true
  if (request.destination === 'style' || request.destination === 'script') return true
  if (request.destination === 'font' || request.destination === 'image') return true
  return /\.(css|js|woff2?|svg|png|ico|webmanifest)$/i.test(url.pathname)
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
      )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (isSensitiveRequest(url)) return

  if (isStaticAssetRequest(url, request)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone()
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone))
            }
            return response
          })
      )
    )
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const offline = await caches.match('/offline.html')
        return offline || Response.error()
      })
    )
  }
})

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
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: payload.referenceId
          ? `supplify-${payload.referenceType}-${payload.referenceId}`
          : undefined,
        data: { url },
        vibrate: [120, 60, 120],
        silent: false,
      })
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
