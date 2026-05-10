// ============================================================================
// PROPHET — Edge Function: fetch_prices
// Cron : */1 * * * * (toutes les minutes)
// Récupère les prix de tous les actifs actifs et les insère dans `prices`.
// Sources : CoinGecko (cg, free), Finnhub (fh, key), TwelveData (td, key)
// ============================================================================

// @ts-ignore — types résolus à l'exécution Deno
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

interface Asset {
  id: string
  category: string
  api_source: string
  api_id: string
  active: boolean
}

interface PriceRow {
  asset_id: string
  price: number
  change_24h: number | null
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const FINNHUB_KEY = Deno.env.get('FINNHUB_API_KEY') || ''
const TWELVE_KEY = Deno.env.get('TWELVE_API_KEY') || ''

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ---------------------------------------------------------------------------
// CoinGecko (gratuit, no key, batch endpoint)
// ---------------------------------------------------------------------------
async function fetchCryptos (assets: Asset[]): Promise<PriceRow[]> {
  if (!assets.length) return []
  const ids = assets.map(a => a.api_id).join(',')
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
  try {
    const r = await fetch(url, { headers: { 'accept': 'application/json' } })
    if (!r.ok) {
      console.error('CG error', r.status)
      return []
    }
    const data: Record<string, { usd: number, usd_24h_change?: number }> = await r.json()
    const out: PriceRow[] = []
    for (const a of assets) {
      const item = data[a.api_id]
      if (!item || typeof item.usd !== 'number') continue
      out.push({
        asset_id: a.id,
        price: item.usd,
        change_24h: typeof item.usd_24h_change === 'number' ? item.usd_24h_change : null
      })
    }
    return out
  } catch (e) {
    console.error('CG fetch error', e)
    return []
  }
}

// ---------------------------------------------------------------------------
// Finnhub (1 appel / asset, free quota = 60 req/min)
// ---------------------------------------------------------------------------
async function fetchStocks (assets: Asset[]): Promise<PriceRow[]> {
  if (!assets.length || !FINNHUB_KEY) return []
  const out: PriceRow[] = []
  // Limit batch to 30 to stay under quota with margin
  const batch = assets.slice(0, 30)
  await Promise.all(batch.map(async a => {
    try {
      const url = `https://finnhub.io/api/v1/quote?symbol=${a.api_id}&token=${FINNHUB_KEY}`
      const r = await fetch(url)
      if (!r.ok) return
      const data: { c?: number, dp?: number } = await r.json()
      if (typeof data.c !== 'number' || data.c <= 0) return
      out.push({
        asset_id: a.id,
        price: data.c,
        change_24h: typeof data.dp === 'number' ? data.dp : null
      })
    } catch (_) { /* skip silently */ }
  }))
  return out
}

// ---------------------------------------------------------------------------
// TwelveData (indices, commodities, forex, VIX) — 8 req/min en free tier
// ---------------------------------------------------------------------------
async function fetchTwelveData (assets: Asset[]): Promise<PriceRow[]> {
  if (!assets.length || !TWELVE_KEY) return []
  // Batch endpoint accepte symbols séparés par virgules
  const symbols = assets.map(a => a.api_id).join(',')
  try {
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols)}&apikey=${TWELVE_KEY}`
    const r = await fetch(url)
    if (!r.ok) return []
    const data = await r.json()
    const out: PriceRow[] = []
    // Réponse différente si 1 vs N : { symbol: { close } } OU { close }
    const rows: Record<string, any> = assets.length === 1
      ? { [assets[0].api_id]: data }
      : data
    for (const a of assets) {
      const row = rows[a.api_id]
      if (!row || typeof row.close !== 'string' && typeof row.close !== 'number') continue
      const price = Number(row.close)
      if (!isFinite(price) || price <= 0) continue
      const change = row.percent_change != null ? Number(row.percent_change) : null
      out.push({
        asset_id: a.id,
        price,
        change_24h: isFinite(change as number) ? change : null
      })
    }
    return out
  } catch (e) {
    console.error('TD fetch error', e)
    return []
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  const start = Date.now()
  try {
    // Récupérer la liste des actifs actifs
    const { data: assets, error } = await sb
      .from('assets')
      .select('id, category, api_source, api_id, active')
      .eq('active', true)
    if (error) throw error
    if (!assets) throw new Error('No assets')

    // Dispatch par source
    const cryptos = (assets as Asset[]).filter(a => a.api_source === 'cg')
    const stocks  = (assets as Asset[]).filter(a => a.api_source === 'fh')
    const tdRows  = (assets as Asset[]).filter(a => a.api_source === 'td')

    const [pCrypto, pStocks, pTd] = await Promise.all([
      fetchCryptos(cryptos),
      fetchStocks(stocks),
      fetchTwelveData(tdRows)
    ])

    const allPrices = [...pCrypto, ...pStocks, ...pTd]

    // Écriture batch via RPC (SECURITY DEFINER, service_role)
    if (allPrices.length > 0) {
      const { data: count, error: rpcErr } = await sb.rpc('record_prices_batch', {
        p_prices: allPrices
      })
      if (rpcErr) throw rpcErr
      console.log(`Inserted ${count} prices in ${Date.now() - start}ms`)
    }

    return new Response(JSON.stringify({
      ok: true,
      fetched: allPrices.length,
      crypto: pCrypto.length,
      stocks: pStocks.length,
      td: pTd.length,
      ms: Date.now() - start
    }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('fetch_prices error', e)
    return new Response(JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
