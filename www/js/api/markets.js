// ============================================================================
// PROPHET — API: markets
// Fetch markets (open / locked / resolved) + place_bet RPC + bootstrap demo
// ============================================================================

import { sb } from '../supabase-client.js'

// Tous les marchés ouverts (acceptent encore des stakes), avec asset + dernière info
export async function fetchOpenMarkets () {
  const { data, error } = await sb
    .from('markets')
    .select('id, asset_id, market_type, timeframe_minutes, topic, outcome_label, image_emoji, subtitle, sort_order, question, opens_at, stakes_close_at, resolves_at, price_open, status, total_up_stakes, total_down_stakes')
    .eq('status', 'open')
    .order('sort_order', { ascending: false })
    .order('resolves_at', { ascending: true })
  if (error) {
    console.warn('fetchOpenMarkets error', error)
    return []
  }
  return data || []
}

// Group markets par topic (ou par asset_id pour directional)
export function groupMarketsByTopic (markets) {
  const groups = new Map()
  for (const m of markets) {
    const key = m.market_type === 'directional'
      ? `directional:${m.asset_id}`
      : `event:${m.topic || 'Autre'}`
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        type: m.market_type,
        topic: m.topic,
        asset_id: m.asset_id,
        image_emoji: m.image_emoji,
        question: m.question,
        subtitle: m.subtitle,
        sort_order: m.sort_order || 0,
        markets: []
      })
    }
    groups.get(key).markets.push(m)
  }
  // Tri global par sort_order desc, puis par volume total desc
  return Array.from(groups.values()).sort((a, b) => {
    if (b.sort_order !== a.sort_order) return b.sort_order - a.sort_order
    const volA = a.markets.reduce((s, m) => s + Number(m.total_up_stakes || 0) + Number(m.total_down_stakes || 0), 0)
    const volB = b.markets.reduce((s, m) => s + Number(m.total_up_stakes || 0) + Number(m.total_down_stakes || 0), 0)
    return volB - volA
  })
}

// Liste unique de tous les topics présents (pour les onglets en haut)
export function extractTopics (markets) {
  const set = new Set()
  for (const m of markets) {
    if (m.topic) set.add(m.topic)
  }
  return Array.from(set)
}

export async function fetchMarketsByAsset (assetId) {
  const { data, error } = await sb
    .from('markets')
    .select('id, asset_id, market_type, timeframe_minutes, question, opens_at, stakes_close_at, resolves_at, price_open, status, total_up_stakes, total_down_stakes')
    .eq('asset_id', assetId)
    .in('status', ['open', 'locked'])
    .order('timeframe_minutes', { ascending: true })
  if (error) {
    console.warn('fetchMarketsByAsset error', error)
    return []
  }
  return data || []
}

export async function fetchMarketById (marketId) {
  const { data, error } = await sb
    .from('markets')
    .select('id, asset_id, market_type, timeframe_minutes, question, opens_at, stakes_close_at, resolves_at, price_open, price_close, status, outcome, total_up_stakes, total_down_stakes')
    .eq('id', marketId)
    .single()
  if (error) {
    console.warn('fetchMarketById error', error)
    return null
  }
  return data
}

// Place bet via RPC (anti-cheat, atomique)
export async function placeBet ({ marketId, side, stake, leverage }) {
  const { data, error } = await sb.rpc('place_bet', {
    p_market_id: marketId,
    p_side: side,
    p_stake: stake,
    p_leverage: leverage
  })
  if (error) throw error
  return data // UUID de la position créée
}

// Importe un market externe (Polymarket / Manifold) à la demande
// Retourne l'UUID interne (idempotent : si déjà importé, renvoie le même UUID)
export async function importExternalMarket (m) {
  const externalId = String(m.id || '').replace(/^(pm|mf):/, '')
  if (!externalId || !m.external_source) {
    throw new Error('External market missing id or source')
  }
  const payload = {
    external_id: externalId,
    external_source: m.external_source,
    topic: m.topic,
    question: m.question,
    outcome_label: m.outcome_label,
    image_emoji: m.image_emoji,
    subtitle: m.subtitle,
    opens_at: m.opens_at,
    stakes_close_at: m.stakes_close_at,
    resolves_at: m.resolves_at,
    sort_order: m.sort_order,
    total_up_stakes: m.total_up_stakes,
    total_down_stakes: m.total_down_stakes
  }
  const { data, error } = await sb.rpc('import_external_market', { p_market: payload })
  if (error) throw error
  return data
}

// Bootstrap : crée un cycle de marchés directionnels pour TOUS les actifs actifs
// Réservé à service_role en prod, mais permet de tester en dev
export async function bootstrapMarkets () {
  const { data, error } = await sb.rpc('bootstrap_markets')
  if (error) throw error
  return data
}
