// ============================================================================
// PROPHET — Positions view
// 2 onglets : Ouvertes (live countdown) · Historique (30 dernières)
// ============================================================================

import { fetchOpenPositions, fetchPositionHistory, subscribeToOwnPositions, unsubscribeFromOwnPositions } from '../api/positions.js'
import { sb } from '../supabase-client.js'
import { getLang } from '../i18n/index.js'
import { escHTML, htmlRaw } from '../utils/escHTML.js'
import { renderPositionCard } from '../components/position-card.js'

let assetsConfig = null

async function loadConfig () {
  if (assetsConfig) return assetsConfig
  const r = await fetch('data/assets-config.json', { cache: 'force-cache' })
  assetsConfig = await r.json()
  return assetsConfig
}

// Récupère les marchés associés aux positions courantes en un seul appel
async function fetchMarketsByIds (marketIds) {
  if (!marketIds.length) return {}
  const { data } = await sb
    .from('markets')
    .select('id, asset_id, timeframe_minutes, price_open, price_close, resolves_at, status, outcome')
    .in('id', marketIds)
  if (!data) return {}
  return Object.fromEntries(data.map(m => [m.id, m]))
}

export async function mountPositions (rootEl) {
  let tab = 'open'
  let openPositions = []
  let historyPositions = []
  let marketsById = {}
  let cfg = await loadConfig()
  const assetsById = Object.fromEntries(cfg.assets.map(a => [a.id, a]))

  function render () {
    const lang = getLang()

    rootEl.innerHTML = htmlRaw`
      <div class="container stack-4">

        <div class="lang-toggle" style="align-self:center">
          <button data-tab="open" class="${tab === 'open' ? 'active' : ''}">
            ${lang === 'fr' ? 'Ouvertes' : 'Open'} (${openPositions.length})
          </button>
          <button data-tab="history" class="${tab === 'history' ? 'active' : ''}">
            ${lang === 'fr' ? 'Historique' : 'History'}
          </button>
        </div>

        <div id="positions-list" class="stack-3"></div>
      </div>
    `

    rootEl.querySelectorAll('[data-tab]').forEach(b => {
      b.addEventListener('click', () => {
        tab = b.getAttribute('data-tab')
        render()
      })
    })

    renderList()
  }

  function renderList () {
    const list = rootEl.querySelector('#positions-list')
    if (!list) return
    const positions = tab === 'open' ? openPositions : historyPositions
    list.innerHTML = ''

    if (positions.length === 0) {
      const lang = getLang()
      list.innerHTML = htmlRaw`
        <div class="empty-state">
          <div class="empty-icon">${tab === 'open' ? '⚡' : '📜'}</div>
          <div>${tab === 'open'
            ? (lang === 'fr' ? 'Aucune position ouverte' : 'No open positions')
            : (lang === 'fr' ? 'Aucun trade résolu' : 'No resolved trades')}
          </div>
          <div class="empty-cta text-mute" style="font-size:var(--fs-xs);margin-top:var(--sp-2)">
            ${lang === 'fr' ? 'Va dans Marchés et place ton premier trade' : 'Go to Markets and place your first trade'}
          </div>
        </div>
      `
      return
    }

    positions.forEach(p => {
      const m = marketsById[p.market_id]
      const a = m ? assetsById[m.asset_id] : null
      list.appendChild(renderPositionCard({ position: p, market: m, asset: a }))
    })
  }

  async function reload () {
    const [open, hist] = await Promise.all([
      fetchOpenPositions(),
      fetchPositionHistory(30)
    ])
    openPositions = open
    historyPositions = hist

    const marketIds = Array.from(new Set([...open, ...hist].map(p => p.market_id)))
    marketsById = await fetchMarketsByIds(marketIds)

    render()
  }

  await reload()

  subscribeToOwnPositions()
  window.addEventListener('positions-changed', reload)
  window.addEventListener('lang-changed', render)

  // Cleanup retourné à main.js
  return () => {
    unsubscribeFromOwnPositions()
    window.removeEventListener('positions-changed', reload)
    window.removeEventListener('lang-changed', render)
  }
}
