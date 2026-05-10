// ============================================================================
// PROPHET — Polymarket Gamma API (vraies prédictions live)
// API publique, pas de clé, CORS OK
// Endpoint : https://gamma-api.polymarket.com/markets
// ============================================================================

const ENDPOINT = 'https://gamma-api.polymarket.com/markets'
const CACHE_KEY = 'prophet.polymarket_cache'
const CACHE_TTL_MS = 60_000  // 1 min en mémoire
const STORAGE_TTL_MS = 24 * 60 * 60 * 1000  // 24h sur disque

let memCache = null
let memTs = 0
let inflight = null

// Heuristique : assigne un emoji selon le contenu de la question
function pickEmoji (q) {
  const s = (q || '').toLowerCase()
  if (/trump/.test(s))                     return '🇺🇸'
  if (/biden|harris|kamala/.test(s))       return '🇺🇸'
  if (/iran|israël|israel|gaza/.test(s))   return '☮️'
  if (/russi|ukrain|putin|poutine/.test(s)) return '🕊️'
  if (/china|chine|xi/.test(s))            return '🐉'
  if (/election|président|presiden/.test(s)) return '🗳️'
  if (/fed|inflation|recession|récession/.test(s)) return '🏦'
  if (/bitcoin|btc/.test(s))               return '₿'
  if (/ethereum|eth\b/.test(s))            return 'Ξ'
  if (/sol[ \-]|solana/.test(s))           return '◎'
  if (/nba|basketball/.test(s))            return '🏀'
  if (/nfl|football/.test(s))              return '🏈'
  if (/soccer|fifa|world cup|coupe.*monde/.test(s)) return '⚽'
  if (/ufc|mma|fight/.test(s))             return '🥊'
  if (/oscar|emmy|grammy|movie|film/.test(s)) return '🎬'
  if (/ai|gpt|llm|openai|anthropic|claude/.test(s)) return '🤖'
  if (/spacex|elon|musk|starship/.test(s)) return '🚀'
  if (/jesus|christ|religion/.test(s))     return '✝️'
  if (/rihanna|carti|drake|kanye|album/.test(s)) return '🎤'
  if (/gta|game/.test(s))                  return '🎮'
  if (/weather|hurricane|storm|temp/.test(s)) return '🌪️'
  if (/oil|petrol|brent|wti/.test(s))      return '🛢️'
  if (/nuclear|atomique/.test(s))          return '☢️'
  if (/alien|ufo|extraterre/.test(s))      return '👽'
  return '🌐'
}

// Heuristique topic
function pickTopic (q) {
  const s = (q || '').toLowerCase()
  if (/trump|biden|election|président|senate|house/.test(s)) return 'Politique'
  if (/iran|israel|gaza|war|guerre|peace|cease/.test(s))     return 'Géopolitique'
  if (/ukrain|russi/.test(s))                                return 'Ukraine'
  if (/china|chine/.test(s))                                 return 'Chine'
  if (/fed|inflation|recess|récess|gdp|pib/.test(s))         return 'Économie'
  if (/bitcoin|btc|ethereum|eth |sol |crypto/.test(s))       return 'Crypto'
  if (/nba|knicks|lakers|celtics/.test(s))                   return 'NBA'
  if (/nfl|super bowl/.test(s))                              return 'NFL'
  if (/fifa|world cup|coupe.*monde|champion.*league/.test(s)) return 'Football'
  if (/ufc|mma/.test(s))                                     return 'UFC'
  if (/oscar|emmy|grammy/.test(s))                           return 'Awards'
  if (/ai|gpt|openai|anthropic/.test(s))                     return 'AI'
  if (/spacex|elon|musk|starship/.test(s))                   return 'SpaceX'
  if (/album|rihanna|drake|kanye/.test(s))                   return 'Musique'
  return 'Polymarket'
}

function parseOutcomePrices (raw) {
  if (Array.isArray(raw)) return raw.map(parseFloat)
  if (typeof raw === 'string') {
    try { return JSON.parse(raw).map(parseFloat) } catch {}
  }
  return [0.5, 0.5]
}

// Convertit un market Polymarket vers notre format interne
function toOurMarket (pm) {
  const prices = parseOutcomePrices(pm.outcomePrices)
  const yesPct = prices[0] || 0.5
  const volume = parseFloat(pm.volume || pm.volumeNum || 0)
  const question = pm.question || pm.title || ''

  return {
    id: 'pm:' + pm.id,
    market_type: 'event',
    topic: pickTopic(question),
    question,
    outcome_label: null,
    image_emoji: pickEmoji(question),
    image_url: pm.image || null,
    subtitle: null,
    sort_order: Math.min(99, Math.floor(volume / 10000)),
    opens_at: pm.startDate || null,
    stakes_close_at: pm.endDate || null,
    resolves_at: pm.endDate || null,
    status: 'open',
    // On encode les odds réels via les "stakes" (1000 unités totales)
    total_up_stakes: Math.round(yesPct * 1000),
    total_down_stakes: Math.round((1 - yesPct) * 1000),
    // Métadonnées internes : utilisées par import_external_market RPC, jamais affichées
    is_external: true,
    external_source: 'polymarket',
    asset_id: null
  }
}

// Fetch principal : retourne l'array de markets convertis
export async function fetchPolymarketMarkets (limit = 50) {
  // Cache mémoire 1min
  if (memCache && Date.now() - memTs < CACHE_TTL_MS) return memCache
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const url = `${ENDPOINT}?active=true&closed=false&archived=false&limit=${limit}&order=volume24hr&ascending=false`
      const res = await fetch(url, { cache: 'no-cache' })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const data = await res.json()
      const out = (Array.isArray(data) ? data : []).map(toOurMarket)
      memCache = out
      memTs = Date.now()
      // Persist on disk for offline fallback
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: memTs, data: out })) } catch (_) {}
      return out
    } catch (e) {
      console.warn('[polymarket] fetch failed, using cache fallback', e)
      return loadCachedPolymarket() || []
    } finally {
      inflight = null
    }
  })()
  return inflight
}

// Charge le cache localStorage si dispo (et < 24h)
export function loadCachedPolymarket () {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (!Array.isArray(data) || Date.now() - ts > STORAGE_TTL_MS) return null
    return data
  } catch { return null }
}
