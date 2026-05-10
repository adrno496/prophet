// ============================================================================
// PULSE PREDICT — Coach prompt builder + parser
// Fabrique un prompt pour générer 3 prédictions IA et parse la réponse JSON.
// ============================================================================

const SYSTEM_PROMPT = `You are PULSE Coach, a probabilistic market analyst for short-term crypto predictions on PULSE PREDICT (a virtual prediction market).

Rules:
- Output ONLY valid JSON, no markdown fences, no preamble.
- 3 distinct predictions, each on a different market.
- pick must be exactly "UP" or "DOWN".
- confidence is 50-90 (50=coin flip, 90=very confident). Never 100.
- reasoning is ONE sentence ≤ 140 chars in French.
- Prefer markets with shorter timeframes (15m-1h) for actionable predictions.

Schema:
[{"market_index": 0, "pick": "UP", "confidence": 65, "reasoning": "Brief sentence"}, ...]`

// markets : [{ id, asset_id, asset_symbol, timeframe_minutes, price_open, resolves_at }]
// prices : { asset_id: { price, change_24h } }
// fng : { value, classification }
export function buildCoachPrompt ({ markets, prices, fng }) {
  const now = new Date()
  const fngLine = fng
    ? `Crypto Fear & Greed: ${fng.value} (${fng.classification})`
    : 'Crypto Fear & Greed: unavailable'

  // Top 6 cryptos sur le dashboard, classés par volatilité 24h
  const cryptoLines = Object.entries(prices)
    .filter(([id]) => ['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX'].includes(id))
    .map(([id, p]) => `- ${id}: $${Number(p.price).toFixed(2)} (${(p.change_24h ?? 0).toFixed(2)}% 24h)`)
    .join('\n')

  // Sélectionne les 8 markets les plus pertinents (timeframes courts, BTC/ETH d'abord)
  const sortedMarkets = [...markets]
    .filter(m => m.market_type === 'directional' && m.timeframe_minutes <= 240)
    .sort((a, b) => {
      const priority = { BTC: 0, ETH: 1, SOL: 2 }
      const pa = priority[a.asset_id] ?? 9
      const pb = priority[b.asset_id] ?? 9
      if (pa !== pb) return pa - pb
      return (a.timeframe_minutes || 0) - (b.timeframe_minutes || 0)
    })
    .slice(0, 8)

  const marketLines = sortedMarkets.map((m, i) => {
    const tf = m.timeframe_minutes >= 60
      ? `${m.timeframe_minutes / 60}h`
      : `${m.timeframe_minutes}min`
    const resolveTime = new Date(m.resolves_at).toUTCString().slice(17, 22)
    return `${i}. ${m.asset_id} ${tf} (entry $${Number(m.price_open).toFixed(2)}, resolves ${resolveTime} UTC)`
  }).join('\n')

  const prompt = `Date: ${now.toISOString().slice(0, 16)} UTC

Current crypto prices:
${cryptoLines || '(no prices loaded)'}

${fngLine}

Available markets:
${marketLines || '(no markets)'}

Generate 3 predictions in JSON.`

  return {
    system: SYSTEM_PROMPT,
    user: prompt,
    sortedMarkets // pour mapper market_index → market_id ensuite
  }
}

// Parse la réponse de l'IA, robuste aux fences markdown
export function parseCoachResponse (text, sortedMarkets) {
  if (!text) return []
  // Strip markdown code fences (```json ... ```)
  let cleaned = text.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()

  // Si l'IA a précédé d'une explication, extraire le premier array JSON
  const arrayMatch = cleaned.match(/\[\s*\{[\s\S]*?\}\s*\]/)
  if (arrayMatch) cleaned = arrayMatch[0]

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch (e) {
    console.warn('[coach] parse failed, raw:', text.slice(0, 200))
    return []
  }
  if (!Array.isArray(parsed)) return []

  return parsed
    .map((p) => {
      const idx = Number(p.market_index)
      if (!Number.isInteger(idx) || idx < 0 || idx >= sortedMarkets.length) return null
      const market = sortedMarkets[idx]
      const pick = String(p.pick || '').toUpperCase()
      if (!['UP', 'DOWN'].includes(pick)) return null
      const confidence = Math.max(0, Math.min(100, Math.round(Number(p.confidence) || 0)))
      const reasoning = String(p.reasoning || '').slice(0, 800)
      return { market, pick, confidence, reasoning }
    })
    .filter(Boolean)
    .slice(0, 3)
}
