// ============================================================================
// PROPHET — Dashboard view
// Balance · stats · F&G · open positions · CTA Markets
// ============================================================================

import { store, claimDailyBonus, fetchFearGreed, loadProfile } from '../state.js'
import { fetchOpenPositions, subscribeToOwnPositions, unsubscribeFromOwnPositions } from '../api/positions.js'
import { fetchAllLatestPrices, subscribeToPrices, unsubscribeFromPrices } from '../api/prices.js'
import { fetchTodayAIPredictions, submitAIPrediction, fetchAICoachStats } from '../api/ai-coach.js'
import { fetchOpenMarkets } from '../api/markets.js'
import { callAI, QuotaExceededError } from '../ai/client.js'
import { hasAI } from '../ai/settings.js'
import { buildCoachPrompt, parseCoachResponse } from '../ai/coach-prompt.js'
import { renderAICoachCard } from '../components/ai-coach-card.js'
import { openTradeModal } from '../components/trade-modal.js'
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
  let coachPredictions = []
  let coachStats = null
  let coachGenerating = false
  let openMarketsCache = []

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

        <div class="section" id="dash-coach-section">
          <div class="row-between">
            <div class="section-title" style="margin-bottom:0">🤖 ${lang === 'fr' ? 'IA Coach du jour' : 'AI Coach today'}</div>
            <span id="coach-stats" class="text-mute" style="font-size:var(--fs-xs)"></span>
          </div>
          <div id="dash-coach" class="stack-3" style="margin-top:var(--sp-3)"></div>
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
    renderCoach()
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

  function renderCoach () {
    const root = rootEl.querySelector('#dash-coach')
    const statsEl = rootEl.querySelector('#coach-stats')
    if (!root) return
    const lang = getLang()
    const aiReady = hasAI()

    if (statsEl && coachStats) {
      const acc = coachStats.accuracy
      statsEl.textContent = acc != null
        ? (lang === 'fr' ? `Précision IA : ${acc}%` : `AI accuracy: ${acc}%`)
        : (lang === 'fr' ? 'Pas encore résolu' : 'Not yet resolved')
    }

    root.innerHTML = ''
    const cfg = assetsConfig
    const assetsById = cfg ? Object.fromEntries(cfg.assets.map(a => [a.id, a])) : {}
    const marketsById = Object.fromEntries(openMarketsCache.map(m => [m.id, m]))

    if (coachPredictions.length > 0) {
      coachPredictions.forEach(p => {
        const m = marketsById[p.reference_id]
        const a = m ? assetsById[m.asset_id] : null
        root.appendChild(renderAICoachCard({
          prediction: p, market: m, asset: a,
          onFollow: handleCoachAction,
          onAgainst: handleCoachAction
        }))
      })
      return
    }

    // Empty state : pas de prédictions aujourd'hui
    const empty = document.createElement('div')
    empty.className = 'ai-coach-empty'
    empty.innerHTML = htmlRaw`
      <div style="font-size:36px">🤖</div>
      <div style="font-weight:700">${lang === 'fr' ? 'Aucune prédiction IA aujourd\'hui' : 'No AI predictions today'}</div>
      <div class="text-mute" style="font-size:var(--fs-xs);max-width:300px;line-height:1.5">
        ${aiReady
          ? (lang === 'fr' ? 'Génère 3 prédictions live depuis ton IA configurée. Elles seront partagées avec tous les joueurs.' : 'Generate 3 live predictions from your configured AI. They\'ll be shared with all players.')
          : (lang === 'fr' ? 'Configure ton IA dans le profil (mode gratuit dispo) pour générer les prédictions du jour.' : 'Configure your AI in profile (free mode available) to generate today\'s predictions.')}
      </div>
      <button id="btn-coach-gen" class="btn btn-primary btn-block" ${(!aiReady || coachGenerating) ? 'disabled' : ''}>
        ${coachGenerating ? '⏳ ' + (lang === 'fr' ? 'Génération…' : 'Generating…') : (aiReady ? '🤖 ' + (lang === 'fr' ? 'Générer' : 'Generate') : '⚙️ ' + (lang === 'fr' ? 'Configurer dans profil' : 'Configure in profile'))}
      </button>
    `
    root.appendChild(empty)
    rootEl.querySelector('#btn-coach-gen')?.addEventListener('click', () => {
      if (aiReady) generateCoach()
      else window.location.hash = '#profile'
    })
  }

  async function generateCoach () {
    if (coachGenerating) return
    coachGenerating = true
    renderCoach()
    try {
      // Charger les markets ouverts si pas en cache
      if (openMarketsCache.length === 0) {
        openMarketsCache = await fetchOpenMarkets()
      }
      const cfg = assetsConfig
      const assetsById = cfg ? Object.fromEntries(cfg.assets.map(a => [a.id, a])) : {}
      // Enrichir markets avec asset_symbol pour le prompt
      const marketsForPrompt = openMarketsCache
        .filter(m => m.market_type === 'directional' && m.asset_id)
        .map(m => ({ ...m, asset_symbol: assetsById[m.asset_id]?.symbol || m.asset_id }))

      const prices = store.prices || {}
      const fng = store.fng

      if (marketsForPrompt.length === 0) {
        toast.warning(getLang() === 'fr'
          ? 'Aucun marché ouvert. Lance les marchés depuis l\'onglet Marchés.'
          : 'No open markets. Bootstrap them from Markets tab.', 5000)
        return
      }

      const { system, user, sortedMarkets } = buildCoachPrompt({ markets: marketsForPrompt, prices, fng })

      let aiText
      try {
        aiText = await callAI({ system, user, maxTokens: 800 })
      } catch (e) {
        if (e instanceof QuotaExceededError) {
          toast.error(getLang() === 'fr'
            ? `Quota IA atteint (${e.used}/${e.quota}). Reset à minuit UTC.`
            : `AI quota reached (${e.used}/${e.quota}). Resets at midnight UTC.`, 8000)
          return
        }
        toast.error(getLang() === 'fr' ? 'Erreur IA : ' + e.message : 'AI error: ' + e.message, 6000)
        return
      }

      const parsed = parseCoachResponse(aiText, sortedMarkets)
      if (parsed.length === 0) {
        toast.error(getLang() === 'fr'
          ? 'L\'IA a renvoyé un format invalide. Réessaie.'
          : 'AI returned invalid format. Try again.', 6000)
        console.warn('[coach] raw response:', aiText)
        return
      }

      // Soumettre chaque prédiction à la DB (max 3)
      let submitted = 0
      for (const p of parsed) {
        try {
          await submitAIPrediction({
            marketId: p.market.id,
            pick: p.pick,
            confidence: p.confidence,
            reasoning: p.reasoning
          })
          submitted++
        } catch (e) {
          console.warn('[coach] submit failed for market', p.market.id, e.message)
        }
      }

      if (submitted > 0) {
        toast.success(getLang() === 'fr'
          ? `${submitted} prédiction(s) IA soumise(s) ✨`
          : `${submitted} AI prediction(s) submitted ✨`)
        coachPredictions = await fetchTodayAIPredictions()
        renderCoach()
      } else {
        toast.error(getLang() === 'fr' ? 'Aucune prédiction acceptée (déjà soumises ?)' : 'No predictions accepted (already submitted?)', 5000)
      }
    } finally {
      coachGenerating = false
      renderCoach()
    }
  }

  function handleCoachAction (market, side) {
    if (!market) return
    const cfg = assetsConfig
    const assetsById = cfg ? Object.fromEntries(cfg.assets.map(a => [a.id, a])) : {}
    const asset = assetsById[market.asset_id]
    if (!asset) return
    openTradeModal({
      asset,
      market,
      price: (store.prices || {})[asset.id] || null,
      presetSide: side
    })
  }

  async function reloadCoach () {
    const [preds, stats] = await Promise.all([
      fetchTodayAIPredictions(),
      fetchAICoachStats()
    ])
    coachPredictions = preds || []
    coachStats = stats
    renderCoach()
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

    try {
      await Promise.all([
        loadProfile(),
        fetchFearGreed(),
        fetchAllLatestPrices(),
        reloadOpenPositions(),
        reloadCoach(),
        fetchOpenMarkets().then(m => { openMarketsCache = m || []; renderCoach() })
      ])
    } catch (e) {
      console.error('[dashboard] boot fetch error', e)
    }
    subscribeToPrices()
    subscribeToOwnPositions()

    // Best-effort : check achievements (silencieux)
    checkAchievements().catch(() => {})

    // Onboarding (1 fois)
    if (shouldShowOnboarding()) {
      setTimeout(() => showOnboarding(), 800)
    }
  })()

  const unsubProfile = store.on('profile', render)
  const unsubFng = store.on('fng', render)
  const unsubPrices = store.on('prices', render)
  window.addEventListener('positions-changed', reloadOpenPositions)
  window.addEventListener('lang-changed', render)

  // Cleanup retourné à main.js
  return () => {
    if (typeof unsubProfile === 'function') unsubProfile()
    if (typeof unsubFng === 'function') unsubFng()
    if (typeof unsubPrices === 'function') unsubPrices()
    unsubscribeFromPrices()
    unsubscribeFromOwnPositions()
    window.removeEventListener('positions-changed', reloadOpenPositions)
    window.removeEventListener('lang-changed', render)
  }
}
