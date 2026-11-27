// Minimal service worker: makes the app installable and keeps the app shell available offline.
// Data (/api) and live voice (/live) are never cached.
const CACHE = 'srh-shell-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/live') || url.pathname.startsWith('/brand') || url.pathname === '/manifest.webmanifest') return

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/index.html', copy))
          return res
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    // hashed build files never change, so cache-first is safe
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) c.put(req, res.clone())
        return res
      }),
    )
  }
})

// ---- phone notifications from the admin ----
self.addEventListener('push', (e) => {
  let d = { title: 'New message', body: '' }
  try {
    d = Object.assign(d, e.data.json())
  } catch (err) {
    /* plain text or empty push */
  }
  e.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: '/brand/icon-192.png',
      badge: '/brand/icon-192.png',
      tag: d.id || 'srh',
      data: { url: d.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const target = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus()
      return self.clients.openWindow(target)
    }),
  )
})
