// ============================================================================
// PROPHET — Markets browser (Polymarket-style complet)
// Topics scroll horizontal · grid mixte (events + directional) · bootstrap auto
// ============================================================================

import { fetchAllLatestPrices, subscribeToPrices, unsubscribeFromPrices } from '../api/prices.js'
import { fetchOpenMarkets, groupMarketsByTopic, extractTopics, importExternalMarket, subscribeToMarketUpdates, unsubscribeFromMarkets } from '../api/markets.js'
import { lastTickRelative, tickAll } from '../tick.js'
import { bootstrapWithCoinGecko } from '../api/coingecko.js'
import { fetchPolymarketMarkets, loadCachedPolymarket } from '../api/polymarket.js'
import { store } from '../state.js'
import { t, getLang } from '../i18n/index.js'
import { escHTML, htmlRaw } from '../utils/escHTML.js'
import { renderMarketCard } from '../components/market-card.js'
import { renderEventCard } from '../components/event-card.js'
import { openTradeModal } from '../components/trade-modal.js'
import { toast } from '../components/toast.js'

let assetsConfig = null

const PINNED_TOPICS = ['Tous', 'Trending', 'Crypto Live']

async function loadConfig () {
  if (assetsConfig) return assetsConfig
  try {
    const r = await fetch('data/assets-config.json', { cache: 'force-cache' })
    assetsConfig = await r.json()
    return assetsConfig
  } catch (e) {
    console.error('Could not load assets-config.json', e)
    return null
  }
}

// Chips d'asset dynamiques (filtre rapide)
const ASSET_CHIPS = [
  { id: 'BTC',  emoji: '₿' },
  { id: 'ETH',  emoji: 'Ξ' },
  { id: 'SOL',  emoji: '◎' },
  { id: 'DOGE', emoji: '🐕' }
]

export async function mountMarkets (rootEl) {
  let topic = 'Tous'
  let assetChip = null   // 'BTC'|'ETH'|'SOL'|'DOGE'|null
  let search = ''
  let markets = []
  let prices = {}
  let cfg = null
  let bootstrapping = false

  function getTopics () {
    const dynamic = extractTopics(markets)
    // Toujours montrer les pinned + tout topic présent
    const all = [...PINNED_TOPICS]
    for (const tt of dynamic) if (!all.includes(tt)) all.push(tt)
    return all
  }

  function render () {
    const lang = getLang()

    if (!cfg) {
      rootEl.innerHTML = htmlRaw`<div class="container"><p class="text-mute" style="text-align:center;padding:var(--sp-8) 0">${escHTML(t('loading'))}</p></div>`
      return
    }

    const noMarkets = markets.length === 0
    const topics = getTopics()

    rootEl.innerHTML = htmlRaw`
      <div class="container stack-4">

        <div class="pm-cats">
          ${topics.map(tt => htmlRaw`
            <button class="pm-cat ${tt === topic ? 'active' : ''}" data-topic="${escHTML(tt)}">
              ${escHTML(tt)}
            </button>
          `).join('')}
        </div>

        <div class="pm-chips">
          <button class="pm-chip ${!assetChip ? 'active' : ''}" data-chip="">
            ${lang === 'fr' ? 'Tous actifs' : 'All assets'}
          </button>
          ${ASSET_CHIPS.map(c => htmlRaw`
            <button class="pm-chip ${assetChip === c.id ? 'active' : ''}" data-chip="${escHTML(c.id)}">
              <span style="margin-right:4px">${c.emoji}</span>${escHTML(c.id)}
            </button>
          `).join('')}
        </div>

        <input
          id="market-search"
          type="text"
          class="pm-search"
          placeholder="${lang === 'fr' ? '🔍 Rechercher (Trump, BTC, NBA, Iran...)' : '🔍 Search (Trump, BTC, NBA, Iran...)'}"
          value="${escHTML(search)}"
          autocomplete="off"
          spellcheck="false"
        />

        ${noMarkets ? htmlRaw`
          <div class="pm-bootstrap">
            <div style="font-size:32px">🚀</div>
            <div style="font-weight:700;font-size:var(--fs-md)">
              ${lang === 'fr' ? 'Aucun marché actif pour l\'instant' : 'No active markets yet'}
            </div>
            <div class="text-mute" style="font-size:var(--fs-sm);max-width:380px;line-height:1.5">
              ${lang === 'fr'
                ? '1 clic = prix CoinGecko + 120 markets crypto + 50+ marchés événementiels (politique, sport, IA…).'
                : '1 click = CoinGecko prices + 120 crypto markets + 50+ event markets (politics, sport, AI…).'}
            </div>
            <button id="btn-bootstrap" class="btn btn-gold btn-lg" ${bootstrapping ? 'disabled' : ''}>
              ${bootstrapping ? '⏳ ' + (lang === 'fr' ? 'Lancement…' : 'Starting…') : '🚀 ' + (lang === 'fr' ? 'Lancer les marchés' : 'Bootstrap markets')}
            </button>
          </div>
        ` : htmlRaw`
          <div class="row-between" style="font-size:var(--fs-xs);color:var(--muted);padding:0 var(--sp-1)">
            <span>
              ${markets.length} ${lang === 'fr' ? 'marchés actifs' : 'active markets'}
              <span id="tick-indicator" class="tick-dot" title="${lang === 'fr' ? 'Mise à jour automatique toutes les 5 min' : 'Auto-refresh every 5 min'}"></span>
              <span id="tick-relative" class="text-mute" style="margin-left:var(--sp-1)"></span>
            </span>
            <button id="btn-bootstrap" class="btn-link" ${bootstrapping ? 'disabled' : ''}>
              ${bootstrapping ? '⏳' : '🔄 ' + (lang === 'fr' ? 'Rafraîchir' : 'Refresh')}
            </button>
          </div>
        `}

        <div id="pm-grid" class="pm-grid"></div>

      </div>
    `

    rootEl.querySelectorAll('[data-topic]').forEach(b => {
      b.addEventListener('click', () => {
        topic = b.getAttribute('data-topic')
        render()
      })
    })
    rootEl.querySelectorAll('[data-chip]').forEach(b => {
      b.addEventListener('click', () => {
        assetChip = b.getAttribute('data-chip') || null
        render()
      })
    })

    const searchInput = rootEl.querySelector('#market-search')
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        search = searchInput.value.trim()
        renderGrid()
      })
    }

    rootEl.querySelector('#btn-bootstrap')?.addEventListener('click', onBootstrap)

    renderGrid()
  }

  function renderGrid () {
    const grid = rootEl.querySelector('#pm-grid')
    if (!grid || !cfg) return

    const userLevel = store.profile?.level || 1
    const term = search.toLowerCase()

    // Filtre par topic
    let filtered = markets
    // Filtre par asset chip (priorité haute)
    if (assetChip) {
      filtered = filtered.filter(m => m.asset_id === assetChip)
    }
    if (topic === 'Crypto Live') {
      filtered = filtered.filter(m => m.market_type === 'directional')
    } else if (topic === 'Trending') {
      // Trending = les 12 marchés avec le plus de volume + sort_order élevé
      filtered = [...filtered].sort((a, b) => {
        const va = Number(a.total_up_stakes || 0) + Number(a.total_down_stakes || 0)
        const vb = Number(b.total_up_stakes || 0) + Number(b.total_down_stakes || 0)
        return (vb - va) || ((b.sort_order || 0) - (a.sort_order || 0))
      }).slice(0, 24)
    } else if (topic !== 'Tous') {
      filtered = filtered.filter(m => m.topic === topic)
    }

    // Filtre par search
    if (term) {
      filtered = filtered.filter(m => {
        return (m.question || '').toLowerCase().includes(term)
            || (m.topic || '').toLowerCase().includes(term)
            || (m.outcome_label || '').toLowerCase().includes(term)
            || (m.asset_id || '').toLowerCase().includes(term)
      })
    }

    grid.innerHTML = ''

    if (filtered.length === 0) {
      grid.innerHTML = htmlRaw`
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">🔍</div>
          ${escHTML(getLang() === 'fr' ? 'Aucun marché trouvé' : 'No markets found')}
        </div>
      `
      return
    }

    // Group par topic (events) ou par asset (directional)
    const groups = groupMarketsByTopic(filtered)
    const assetsById = Object.fromEntries(cfg.assets.map(a => [a.id, a]))

    for (const g of groups) {
      let card
      if (g.type === 'directional') {
        const asset = assetsById[g.asset_id]
        if (!asset) continue
        card = renderMarketCard({
          asset,
          price: prices[g.asset_id] || null,
          markets: g.markets,
          userLevel,
          onTimeframeClick: (a, m, side) => {
            openTradeModal({ asset: a, market: m, price: prices[a.id] || null, presetSide: side })
          }
        })
      } else {
        card = renderEventCard({
          group: g,
          onBet: async ({ market, side }) => {
            const fakeAsset = {
              id: g.topic || 'event',
              name: market.question,
              symbol: g.image_emoji || '',
              category: 'event'
            }
            // Markets externes (Polymarket / Manifold) : import on-demand → place_bet sur l'UUID interne
            let bettableMarket = market
            if (market.is_external) {
              try {
                const internalId = await importExternalMarket(market)
                bettableMarket = { ...market, id: internalId, is_external: false }
              } catch (e) {
                toast.error(getLang() === 'fr'
                  ? 'Import du marché échoué : ' + (e.message || 'erreur inconnue')
                  : 'Market import failed: ' + (e.message || 'unknown error'), 6000)
                return
              }
            }
            openTradeModal({ asset: fakeAsset, market: bettableMarket, price: null, presetSide: side })
          }
        })
      }
      grid.appendChild(card)
    }
  }

  async function onBootstrap () {
    if (bootstrapping) return
    bootstrapping = true
    render()
    try {
      const result = await bootstrapWithCoinGecko()
      console.log('[bootstrap] result:', result)
      if (result.error) {
        toast.error('Bootstrap : ' + result.error, 6000)
      } else {
        const lang = getLang()
        const parts = []
        if (result.opened > 0)   parts.push(`${result.opened} ${lang === 'fr' ? 'directionnels' : 'directional'}`)
        if (result.events > 0)   parts.push(`${result.events} ${lang === 'fr' ? 'événements' : 'events'}`)
        if (result.resolved > 0) parts.push(`${result.resolved} ${lang === 'fr' ? 'résolus' : 'resolved'}`)
        if (result.locked > 0)   parts.push(`${result.locked} ${lang === 'fr' ? 'verrouillés' : 'locked'}`)
        toast.success(parts.join(' · ') || (lang === 'fr' ? 'Aucun changement' : 'No changes'))

        const [, m] = await Promise.all([
          fetchAllLatestPrices(),
          fetchOpenMarkets()
        ])
        prices = store.prices || {}
        markets = m || []
      }
    } catch (e) {
      console.error('[bootstrap] error:', e)
      toast.error(e.message || 'Bootstrap failed', 6000)
    } finally {
      bootstrapping = false
      render()
    }
  }

  // Boot
  cfg = await loadConfig()
  render()

  // Affiche d'abord le cache live si dispo (instant)
  const cachedPm = loadCachedPolymarket() || []
  if (cachedPm.length) {
    markets = [...cachedPm]
    render()
  }

  const [priceMap, openMkts, livePredictions] = await Promise.all([
    fetchAllLatestPrices(),
    fetchOpenMarkets(),
    fetchPolymarketMarkets(100).catch(() => cachedPm)
  ])
  prices = store.prices || {}
  // Merge : marchés DB + prédictions live importées
  markets = [...(openMkts || []), ...(livePredictions || [])]
  render()

  subscribeToPrices()
  const unsubStorePrices = store.on('prices', (p) => {
    prices = p || {}
    renderGrid()
  })

  // Realtime markets : quand un autre user place_bet, les stakes changent ici
  subscribeToMarketUpdates((updated) => {
    const idx = markets.findIndex(m => m.id === updated.id)
    if (idx >= 0) {
      markets[idx] = { ...markets[idx], ...updated }
      flashMarketRow(updated.id)
      renderGrid()
    } else if (updated.status === 'open') {
      markets.push(updated)
      renderGrid()
    }
  })

  // Handlers nommés pour pouvoir les retirer au cleanup
  const onMarketsRefreshed = e => {
    const fresh = e.detail?.markets
    if (Array.isArray(fresh)) {
      const externalOnly = markets.filter(m => m.is_external)
      markets = [...fresh, ...externalOnly]
      renderGrid()
    }
  }
  const onPolymarketRefreshed = e => {
    const fresh = e.detail?.markets
    if (Array.isArray(fresh)) {
      const dbOnly = markets.filter(m => !m.is_external)
      markets = [...dbOnly, ...fresh]
      renderGrid()
    }
  }
  window.addEventListener('markets-refreshed', onMarketsRefreshed)
  window.addEventListener('polymarket-refreshed', onPolymarketRefreshed)
  window.addEventListener('tick-completed', updateTickIndicator)
  window.addEventListener('lang-changed', render)

  // Refresh visuel du "il y a Xs" toutes les 10s (clear au cleanup)
  const relativeTimer = setInterval(updateTickIndicator, 10_000)

  function updateTickIndicator () {
    const el = rootEl.querySelector('#tick-relative')
    if (el) el.textContent = lastTickRelative() || ''
  }

  function flashMarketRow (marketId) {
    const card = rootEl.querySelector(`[data-market-id="${marketId}"]`)?.closest('.ev-card, .pm-card')
    if (card) {
      card.classList.add('odds-flash')
      setTimeout(() => card.classList.remove('odds-flash'), 1200)
    }
  }

  // Cleanup retourné à main.js : appelé au switch de vue
  return () => {
    clearInterval(relativeTimer)
    if (typeof unsubStorePrices === 'function') unsubStorePrices()
    unsubscribeFromPrices()
    unsubscribeFromMarkets()
    window.removeEventListener('markets-refreshed', onMarketsRefreshed)
    window.removeEventListener('polymarket-refreshed', onPolymarketRefreshed)
    window.removeEventListener('tick-completed', updateTickIndicator)
    window.removeEventListener('lang-changed', render)
  }
}
