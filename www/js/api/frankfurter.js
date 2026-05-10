// ============================================================================
// PROPHET — Frankfurter API (taux ECB officiels, free, no key)
// Endpoint : https://api.frankfurter.dev/v1/latest
// Couvre EUR/USD, GBP/USD, USD/JPY (pour les 3 actifs forex de PROPHET)
// ============================================================================

const ENDPOINT = 'https://api.frankfurter.dev/v1/latest'
const CACHE_TTL_MS = 60 * 60 * 1000  // 1h (les rates ECB ne bougent qu'une fois par jour)

let memCache = null
let memTs = 0

export async function fetchForexPrices () {
  if (memCache && Date.now() - memTs < CACHE_TTL_MS) return memCache

  try {
    const res = await fetch(`${ENDPOINT}?from=EUR&to=USD,GBP,JPY`, { cache: 'no-cache' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    const r = data?.rates || {}
    if (!r.USD) return null

    // Frankfurter fournit les taux par rapport à EUR (base).
    // PROPHET veut : EUR/USD, GBP/USD, USD/JPY.
    const eurusd = r.USD
    const gbpusd = r.GBP ? r.USD / r.GBP : null
    const usdjpy = r.JPY ? r.JPY / r.USD : null

    const rows = [
      { asset_id: 'EURUSD', price: eurusd, change_24h: null },
      gbpusd ? { asset_id: 'GBPUSD', price: gbpusd, change_24h: null } : null,
      usdjpy ? { asset_id: 'USDJPY', price: usdjpy, change_24h: null } : null
    ].filter(Boolean)

    memCache = rows
    memTs = Date.now()
    return rows
  } catch (e) {
    console.warn('[frankfurter] failed', e)
    return null
  }
}
