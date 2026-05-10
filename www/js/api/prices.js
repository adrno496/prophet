// ============================================================================
// PROPHET — API: prices
// Lecture des prix les plus récents (vue latest_prices) + abonnement Realtime
// ============================================================================

import { sb } from '../supabase-client.js'
import { store } from '../state.js'
import { fetchCoinGeckoCryptos } from './coingecko.js'
import { fetchForexPrices } from './frankfurter.js'

// Cache en mémoire { asset_id: { price, change_24h, timestamp } }
const priceCache = new Map()

export function getCachedPrice (assetId) {
  return priceCache.get(assetId) || null
}

export function getAllCachedPrices () {
  return Object.fromEntries(priceCache)
}

// Charge depuis : DB → CoinGecko (crypto) + Frankfurter (forex) → bundled fallback
export async function fetchAllLatestPrices () {
  const { data, error } = await sb
    .from('latest_prices')
    .select('asset_id, price, change_24h, timestamp')

  if (!error && data && data.length > 0) {
    data.forEach(row => priceCache.set(row.asset_id, row))
    store.set('prices', getAllCachedPrices())
  }

  const now = Date.now()
  const stale = !data || data.length === 0 || data.every(r => {
    const age = now - new Date(r.timestamp).getTime()
    return age > 5 * 60 * 1000
  })

  if (stale) {
    // Top-up en parallèle : CoinGecko (crypto) + Frankfurter (forex)
    const [cg, fx] = await Promise.all([
      fetchCoinGeckoCryptos().catch(() => []),
      fetchForexPrices().catch(() => null)
    ])

    const allRows = [...(cg || []), ...(fx || [])]
    allRows.forEach(row => {
      if (!row?.asset_id || !isFinite(row.price)) return
      const existing = priceCache.get(row.asset_id)
      if (!existing || (now - new Date(existing.timestamp).getTime()) > 5 * 60 * 1000) {
        priceCache.set(row.asset_id, {
          asset_id: row.asset_id,
          price: row.price,
          change_24h: row.change_24h,
          timestamp: new Date().toISOString(),
          source: cg.includes(row) ? 'coingecko_direct' : 'frankfurter'
        })
      }
    })

    // Final fallback : initial-prices.json bundlé (pour les actifs sans live source)
    if (priceCache.size < 5) {
      try {
        const r = await fetch('data/initial-prices.json', { cache: 'force-cache' })
        const json = await r.json()
        for (const [assetId, vals] of Object.entries(json.prices || {})) {
          if (!priceCache.has(assetId)) {
            priceCache.set(assetId, {
              asset_id: assetId,
              price: vals.price,
              change_24h: vals.change_24h,
              timestamp: new Date().toISOString(),
              source: 'bundled'
            })
          }
        }
      } catch (_) {}
    }

    store.set('prices', getAllCachedPrices())
  }

  return priceCache
}

// Souscription Realtime aux nouveaux prix (push automatique)
let pricesChannel = null
export function subscribeToPrices () {
  if (pricesChannel) return pricesChannel
  pricesChannel = sb
    .channel('prices-feed')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'prices' },
      (payload) => {
        const row = payload?.new
        if (!row) return
        const existing = priceCache.get(row.asset_id)
        // Conserver toujours le plus récent
        if (!existing || new Date(row.timestamp) >= new Date(existing.timestamp)) {
          priceCache.set(row.asset_id, {
            asset_id: row.asset_id,
            price: row.price,
            change_24h: row.change_24h,
            timestamp: row.timestamp
          })
          store.set('prices', getAllCachedPrices())
        }
      }
    )
    .subscribe()
  return pricesChannel
}

export function unsubscribeFromPrices () {
  if (pricesChannel) {
    sb.removeChannel(pricesChannel)
    pricesChannel = null
  }
}
