// ============================================================================
// PROPHET — Hard refresh
// Vide tous les caches (service worker, localStorage de cache, sessionStorage)
// Préserve la session auth + langue, puis force un reload complet.
// ============================================================================

const PRESERVE_KEYS = ['prophet.lang', 'prophet.onboarded']

export async function hardRefresh () {
  // 1. Préserver les clés essentielles
  const preserved = {}
  for (const k of PRESERVE_KEYS) {
    try { const v = localStorage.getItem(k); if (v != null) preserved[k] = v } catch {}
  }
  // Supabase auth (sb-*-auth-token) → on garde
  const supabaseAuthEntries = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && (k.startsWith('sb-') || k.startsWith('supabase.auth.'))) {
        supabaseAuthEntries.push([k, localStorage.getItem(k)])
      }
    }
  } catch {}

  // 2. Clear localStorage des caches PROPHET (préserver sb-* et clés essentielles)
  try {
    const cacheKeys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('prophet.') && !PRESERVE_KEYS.includes(k)) {
        cacheKeys.push(k)
      }
    }
    cacheKeys.forEach(k => localStorage.removeItem(k))
  } catch {}

  // 3. SessionStorage : flush complet
  try { sessionStorage.clear() } catch {}

  // 4. Service worker caches (CacheStorage API)
  if ('caches' in window) {
    try {
      const names = await caches.keys()
      await Promise.all(names.map(n => caches.delete(n)))
    } catch (e) { console.warn('[hard-refresh] cache clear failed', e) }
  }

  // 5. Désinscrire le service worker pour forcer un re-fetch propre
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map(r => r.unregister()))
    } catch (e) { console.warn('[hard-refresh] sw unregister failed', e) }
  }

  // 6. Restaurer les clés préservées
  try {
    for (const [k, v] of Object.entries(preserved)) localStorage.setItem(k, v)
    for (const [k, v] of supabaseAuthEntries) if (v) localStorage.setItem(k, v)
  } catch {}

  // 7. Force reload via cache-busting
  const url = new URL(window.location.href)
  url.searchParams.set('_t', Date.now())
  window.location.replace(url.toString())
}
