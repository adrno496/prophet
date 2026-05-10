// ============================================================================
// PROPHET — Service Worker
// Cache app shell pour PWA, network-first pour data, cache-first pour assets
// ============================================================================

const CACHE_NAME = 'prophet-v2'
const APP_SHELL = [
  'index.html',
  'app.html',
  'manifest.json',
  'data/assets-config.json',
  'css/theme.css',
  'css/layout.css',
  'css/components.css',
  'js/main.js',
  'js/supabase-client.js',
  'js/auth.js',
  'js/state.js',
  'js/i18n/index.js',
  'js/i18n/fr.js',
  'js/i18n/en.js',
  'js/views/login.js',
  'js/views/dashboard.js',
  'js/views/profile.js',
  'js/views/markets.js',
  'js/views/positions.js',
  'js/views/leaderboard.js',
  'js/components/header.js',
  'js/components/bottom-tabs.js',
  'js/components/toast.js',
  'js/components/market-card.js',
  'js/components/position-card.js',
  'js/components/countdown.js',
  'js/components/trade-modal.js',
  'js/components/onboarding.js',
  'js/api/prices.js',
  'js/api/markets.js',
  'js/api/positions.js',
  'js/api/leaderboard.js',
  'js/api/achievements.js',
  'js/utils/format.js',
  'js/utils/escHTML.js',
  'js/utils/leverage.js'
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL.map(p => new Request(p, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('SW install error:', err))
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // Skip cross-origin (Supabase, CoinGecko, esm.sh CDN) — laisser le navigateur gérer
  if (url.origin !== self.location.origin) return

  // Network-first pour HTML (toujours frais)
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const copy = res.clone()
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy))
          return res
        })
        .catch(() => caches.match(event.request))
    )
    return
  }

  // Cache-first pour assets statiques
  event.respondWith(
    caches.match(event.request).then(hit => {
      return hit || fetch(event.request).then(res => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy))
        }
        return res
      })
    })
  )
})
