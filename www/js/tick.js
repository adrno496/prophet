// ============================================================================
// PROPHET — Tick global
// Auto-refresh toutes les 5 min de toutes les sources live + market state DB.
// Visibility-aware : pause quand l'onglet est caché, reprend immédiatement à la
// remise en avant. Online-aware : pause si offline.
// ============================================================================

import { fetchAllLatestPrices } from './api/prices.js'
import { fetchOpenMarkets } from './api/markets.js'
import { fetchPolymarketMarkets } from './api/polymarket.js'
import { fetchFearGreed } from './state.js'

const TICK_MS = 5 * 60 * 1000   // 5 min
const FAST_RESUME_MS = 30_000   // si la dernière tick date de + de 30s à la reprise → re-tick immédiat

let intervalHandle = null
let lastTickTs = 0
let inflightTick = null
// Refs des handlers pour pouvoir les retirer dans stopTicking()
let visibilityHandler = null
let onlineHandler = null

export function getLastTickTs () { return lastTickTs }

export async function tickAll () {
  // Skip si offline : on reprend dès que la connexion revient (event 'online')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    console.log('[tick] offline, skipping')
    return null
  }
  if (inflightTick) return inflightTick

  inflightTick = (async () => {
    const start = Date.now()
    const results = await Promise.allSettled([
      fetchAllLatestPrices(),
      fetchOpenMarkets().then(m => {
        window.dispatchEvent(new CustomEvent('markets-refreshed', { detail: { markets: m } }))
        return m
      }),
      fetchPolymarketMarkets(100).then(p => {
        window.dispatchEvent(new CustomEvent('polymarket-refreshed', { detail: { markets: p } }))
        return p
      }),
      fetchFearGreed()
    ])
    lastTickTs = Date.now()
    const ms = lastTickTs - start
    const ok = results.filter(r => r.status === 'fulfilled').length
    console.log(`[tick] done in ${ms}ms · ${ok}/${results.length} sources OK`)
    window.dispatchEvent(new CustomEvent('tick-completed', { detail: { ts: lastTickTs, ms, ok } }))
    return results
  })()

  try { return await inflightTick } finally { inflightTick = null }
}

export function startTicking () {
  if (intervalHandle) return
  intervalHandle = setInterval(tickAll, TICK_MS)

  // Re-tick au retour de visibilité (utile mobile : si tu as laissé l'app ouverte
  // pendant 1h en arrière-plan, on re-fetch dès le retour)
  if (typeof document !== 'undefined') {
    visibilityHandler = () => {
      if (!document.hidden && (Date.now() - lastTickTs) > FAST_RESUME_MS) {
        tickAll()
      }
    }
    document.addEventListener('visibilitychange', visibilityHandler)
  }
  // Re-tick à la reprise de connexion
  if (typeof window !== 'undefined') {
    onlineHandler = () => { tickAll() }
    window.addEventListener('online', onlineHandler)
  }
}

export function stopTicking () {
  if (intervalHandle) clearInterval(intervalHandle)
  intervalHandle = null
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler)
    visibilityHandler = null
  }
  if (onlineHandler) {
    window.removeEventListener('online', onlineHandler)
    onlineHandler = null
  }
}

// Utilitaire : indique le format "il y a Xs/Xmin"
export function lastTickRelative () {
  if (!lastTickTs) return null
  const sec = Math.floor((Date.now() - lastTickTs) / 1000)
  if (sec < 5) return 'maintenant'
  if (sec < 60) return `il y a ${sec}s`
  const min = Math.floor(sec / 60)
  return `il y a ${min}min`
}
