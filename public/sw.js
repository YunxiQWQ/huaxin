// 版心 service worker: caches the static program for offline use.
// It only handles same-origin GET requests; user documents never leave the browser.
const BUILD = new URL(self.location.href).searchParams.get('build') || 'dev'
const PRECACHE = `banxin-precache-${BUILD}`
const RUNTIME = 'banxin-runtime-v1'
const BASE = new URL('./', self.location.href).href

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE)
      try {
        const res = await fetch(`${BASE}precache.json?build=${BUILD}`, { cache: 'no-store' })
        const list = await res.json()
        await cache.addAll(list.files.map((f) => BASE + f))
      } catch (e) {
        // still activate; runtime caching will fill the cache
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('banxin-precache-') && key !== PRECACHE) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || !req.url.startsWith(BASE)) return

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          const cache = await caches.open(PRECACHE)
          cache.put(BASE + 'index.html', res.clone())
          return res
        } catch {
          return (await caches.match(BASE + 'index.html')) || (await caches.match(BASE)) || Response.error()
        }
      })(),
    )
    return
  }

  event.respondWith(
    (async () => {
      const key = url.origin + url.pathname
      const hit = await caches.match(key)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok && (url.pathname.includes('/fonts/') || url.pathname.includes('/templates/') || url.pathname.includes('/assets/'))) {
        const cache = await caches.open(RUNTIME)
        cache.put(key, res.clone())
      }
      return res
    })(),
  )
})
