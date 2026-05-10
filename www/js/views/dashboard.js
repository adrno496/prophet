// ============================================================================
// PROPHET — Dashboard view
// Balance · stats · F&G · open positions · CTA Markets
// ============================================================================

import { store, claimDailyBonus, fetchFearGreed, loadProfile } from '../state.js'
import { fetchOpenPositions, subscribeToOwnPositions } from '../api/positions.js'
import { fetchAllLatestPrices, subscribeToPrices } from '../api/prices.js'
import { sb } from '../supabase-client.js'
import { checkAchievements } from '../api/achievements.js'
import { shouldShowOnboarding, showOnboarding } from '../components/onboarding.js'
import { renderPositionCard } from '../components/position-card.js'
import { t, getLang } from '../i18n/index.js'
import { escHTML, htmlRaw } from '../utils/escHTML.js'
import { formatEUR, formatPrice, formatPct, formatWinrate } from '../utils/format.js'
import { toast } from '../components/toast.js'

let assetsConfig = null

async function loadConfig () {
  if (assetsConfig) return assetsConfig
  try {
    const r = await fetch('data/assets-config.json', { cache: 'force-cache' })
    assetsConfig = await r.json()
  } catch (_) {}
  return assetsConfig
}

function fngColor (value) {
  if (value == null) return { bg: 'var(--card)', fg: 'var(--muted)' }
  if (value < 25) return { bg: 'rgba(239, 68, 68, 0.18)', fg: 'var(--red)' }
  if (value < 50) return { bg: 'rgba(249, 115, 22, 0.18)', fg: 'var(--orange)' }
  if (value < 75) return { bg: 'rgba(250, 204, 21, 0.18)', fg: 'var(--yellow)' }
  return { bg: 'rgba(0, 255, 136, 0.18)', fg: 'var(--neon)' }
}

function fngLabel (classification) {
  const lang = getLang()
  if (!classification) return '—'
  if (lang !== 'fr') return classification
  const map = {
    'Extreme Fear': 'Peur extrême',
    'Fear': 'Peur',
    'Neutral': 'Neutre',
    'Greed': 'Avidité',
    'Extreme Greed': 'Avidité extrême'
  }
  return map[classification] || classification
}

export function mountDashboard (rootEl) {
  let openPositions = []
  let openPositionsMarkets = {}
  let topAssets = []

  function render () {
    const profile = store.profile
    const fng = store.fng
    const prices = store.prices || {}
    const lang = getLang()

    if (!profile) {
      rootEl.innerHTML = htmlRaw`<div class="container"><p class="text-mute" style="padding:var(--sp-8) 0;text-align:center">${escHTML(t('loading'))}</p></div>`
      return
    }

    const fc = fngColor(fng?.value)
    const winrate = formatWinrate(profile.wins, profile.losses)

    rootEl.innerHTML = htmlRaw`
      <div class="container stack-6">

        <div class="balance-card">
          <div class="balance-label">${escHTML(t('dashboard.balance_label'))}</div>
          <div class="balance-amount">${escHTML(formatEUR(profile.balance))}</div>
          <button id="btn-bonus" class="btn btn-gold" style="margin-top:var(--sp-3)">
            ${escHTML(t('dashboard.bonus_btn'))}
          </button>
        </div>

        <div class="grid-4">
          <div class="stat">
            <div class="stat-label">${escHTML(t('dashboard.stats_trades'))}</div>
            <div class="stat-value">${escHTML(profile.total_trades || 0)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${escHTML(t('dashboard.stats_winrate'))}</div>
            <div class="stat-value">${escHTML(winrate)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${escHTML(t('dashboard.stats_pnl'))}</div>
            <div class="stat-value ${profile.total_pnl >= 0 ? 'text-up' : 'text-down'}">${escHTML(formatEUR(profile.total_pnl))}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${escHTML(t('dashboard.stats_peak'))}</div>
            <div class="stat-value text-gold">${escHTML(formatEUR(profile.peak_balance))}</div>
          </div>
        </div>

        <div class="card fng-card">
          <div class="fng-meter" style="background:${fc.bg};color:${fc.fg}">
            ${fng?.value != null ? escHTML(fng.value) : '—'}
          </div>
          <div class="fng-info">
            <div class="fng-label-line">${escHTML(t('dashboard.fng_label'))}</div>
            <div class="fng-classification" style="color:${fc.fg}">
              ${fng ? escHTML(fngLabel(fng.classification)) : escHTML(t('dashboard.fng_unavailable'))}
            </div>
          </div>
        </div>

        <div class="section">
          <div class="row-between">
            <div class="section-title" style="margin-bottom:0">${escHTML(t('dashboard.section_popular'))}</div>
            <a href="#markets" class="btn-link">${lang === 'fr' ? 'Tous →' : 'All →'}</a>
          </div>
          <div class="grid-2" id="dash-markets" style="margin-top:var(--sp-3)">
            ${topAssets.length === 0
              ? Array(6).fill(0).map(() => '<div class="skel skel-card"></div>').join('')
              : topAssets.map(a => {
                  const p = prices[a.id]
                  const change = p?.change_24h
                  const changeClass = change == null ? 'text-mute' : (change >= 0 ? 'text-up' : 'text-down')
                  return htmlRaw`
                    <a href="#markets" class="card card-hover" style="text-decoration:none">
                      <div class="row-between">
                        <span class="badge badge-cat-${escHTML(a.category)}" style="font-size:9px">${escHTML(a.category)}</span>
                        <span class="${changeClass}" style="font-size:var(--fs-xs);font-family:var(--font-mono)">
                          ${change == null ? '—' : escHTML(formatPct(change))}
                        </span>
                      </div>
                      <div style="font-weight:800;margin-top:var(--sp-1)">${escHTML(a.symbol || a.id)}</div>
                      <div class="text-mute truncate" style="font-size:var(--fs-xs)">${escHTML(a.name)}</div>
                      <div class="market-price" style="margin-top:var(--sp-2);font-size:var(--fs-base)">
                        ${escHTML(p ? formatPrice(p.price, a.category) : '—')}
                      </div>
                    </a>
                  `
                }).join('')}
          </div>
        </div>

        <div class="section">
          <div class="row-between">
            <div class="section-title" style="margin-bottom:0">${escHTML(t('dashboard.section_my_positions'))}</div>
            <a href="#positions" class="btn-link">${lang === 'fr' ? 'Toutes →' : 'All →'}</a>
          </div>
          <div id="dash-positions" class="stack-3" style="margin-top:var(--sp-3)"></div>
        </div>

      </div>
    `

    rootEl.querySelector('#btn-bonus')?.addEventListener('click', onClaimBonus)

    renderPositions()
  }

  function renderPositions () {
    const list = rootEl.querySelector('#dash-positions')
    if (!list) return
    if (openPositions.length === 0) {
      list.innerHTML = htmlRaw`
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <div>${escHTML(t('dashboard.no_positions'))}</div>
          <div class="empty-cta text-mute" style="font-size:var(--fs-xs);margin-top:var(--sp-2)">
            <a href="#markets" class="btn-link" style="padding:0">${escHTML(t('dashboard.cta_first_trade'))}</a>
          </div>
        </div>
      `
      return
    }
    list.innerHTML = ''
    const cfg = assetsConfig
    const assetsById = cfg ? Object.fromEntries(cfg.assets.map(a => [a.id, a])) : {}
    openPositions.slice(0, 3).forEach(p => {
      const m = openPositionsMarkets[p.market_id]
      const a = m ? assetsById[m.asset_id] : null
      list.appendChild(renderPositionCard({ position: p, market: m, asset: a }))
    })
  }

  async function onClaimBonus () {
    const btn = rootEl.querySelector('#btn-bonus')
    btn.disabled = true
    try {
      const earned = await claimDailyBonus()
      if (earned > 0) toast.success(t('dashboard.bonus_success'))
      else toast.info(t('dashboard.bonus_claimed'))
    } catch (e) {
      toast.error(t('toast.error_generic') + ' · ' + (e.message || ''))
    } finally {
      btn.disabled = false
    }
  }

  async function reloadOpenPositions () {
    openPositions = await fetchOpenPositions()
    if (openPositions.length > 0) {
      const ids = openPositions.map(p => p.market_id)
      const { data } = await sb.from('markets')
        .select('id, asset_id, timeframe_minutes, resolves_at, status, price_open')
        .in('id', ids)
      openPositionsMarkets = data ? Object.fromEntries(data.map(m => [m.id, m])) : {}
    } else {
      openPositionsMarkets = {}
    }
    renderPositions()
  }

  // Boot
  ;(async () => {
    assetsConfig = await loadConfig()
    if (assetsConfig) {
      // Top 6 cryptos by default (les plus connus)
      const order = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE']
      topAssets = order.map(id => assetsConfig.assets.find(a => a.id === id)).filter(Boolean)
    }
    render()

    await Promise.all([
      loadProfile(),
      fetchFearGreed(),
      fetchAllLatestPrices(),
      reloadOpenPositions()
    ])
    subscribeToPrices()
    subscribeToOwnPositions()

    // Best-effort : check achievements (silencieux)
    checkAchievements().catch(() => {})

    // Onboarding (1 fois)
    if (shouldShowOnboarding()) {
      setTimeout(() => showOnboarding(), 800)
    }
  })()

  store.on('profile', render)
  store.on('fng', render)
  store.on('prices', render)
  window.addEventListener('positions-changed', reloadOpenPositions)
  window.addEventListener('lang-changed', render)
}
