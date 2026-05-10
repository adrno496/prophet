// ============================================================================
// PROPHET — CoinGecko direct (frontend, fallback quand fetch_prices Edge Function pas déployée)
// API publique gratuite, no key. Mappe les ids CG vers les ids PROPHET.
// ============================================================================

import { sb } from '../supabase-client.js'

// Mapping CoinGecko id → PROPHET asset id (les 20 cryptos seedées)
const CG_TO_ASSET = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  binancecoin: 'BNB',
  solana: 'SOL',
  ripple: 'XRP',
  cardano: 'ADA',
  'avalanche-2': 'AVAX',
  dogecoin: 'DOGE',
  tron: 'TRX',
  polkadot: 'DOT',
  chainlink: 'LINK',
  'matic-network': 'MATIC',
  'the-open-network': 'TON',
  'shiba-inu': 'SHIB',
  litecoin: 'LTC',
  'bitcoin-cash': 'BCH',
  near: 'NEAR',
  uniswap: 'UNI',
  cosmos: 'ATOM',
  aptos: 'APT'
}

const CG_IDS = Object.keys(CG_TO_ASSET)

let lastFetch = null
let inflight = null

// Fetch all 20 cryptos en 1 appel batch
export async function fetchCoinGeckoCryptos () {
  if (inflight) return inflight
  // Cache 30s pour éviter rate-limit (10-30 req/min sur le tier gratuit)
  if (lastFetch && Date.now() - lastFetch.ts < 30_000) {
    return lastFetch.data
  }

  inflight = (async () => {
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${CG_IDS.join(',')}&vs_currencies=usd&include_24hr_change=true`
      const res = await fetch(url, { cache: 'no-cache' })
      if (!res.ok) throw new Error('CG http ' + res.status)
      const data = await res.json()

      const rows = []
      for (const [cgId, vals] of Object.entries(data)) {
        const assetId = CG_TO_ASSET[cgId]
        if (!assetId || typeof vals?.usd !== 'number') continue
        rows.push({
          asset_id: assetId,
          price: vals.usd,
          change_24h: typeof vals.usd_24h_change === 'number' ? vals.usd_24h_change : null
        })
      }
      lastFetch = { ts: Date.now(), data: rows }
      return rows
    } catch (e) {
      console.warn('fetchCoinGeckoCryptos failed', e)
      return []
    } finally {
      inflight = null
    }
  })()
  return inflight
}

// Bootstrap : pousse les prix dans la DB + ouvre les marchés directionnels
// Utilisable une fois par session (idempotent côté DB grâce au check stakes_close_at)
export async function bootstrapWithCoinGecko () {
  const rows = await fetchCoinGeckoCryptos()
  if (rows.length === 0) return { seeded: 0, opened: 0 }

  const { data, error } = await sb.rpc('bootstrap_with_prices', { p_prices: rows })
  if (error) {
    console.warn('bootstrap_with_prices failed', error)
    return { seeded: 0, opened: 0, error: error.message }
  }
  return data || { seeded: 0, opened: 0 }
}
