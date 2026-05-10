// ============================================================================
// PROPHET — Market card (Polymarket-style)
// Card avec question + sous-lignes par timeframe (% Up / Yes-No / volume)
// ============================================================================

import { escHTML, htmlRaw } from '../utils/escHTML.js'
import { formatPrice, formatPct, formatEURCompact } from '../utils/format.js'
import { startCountdown } from './countdown.js'
import { getLang } from '../i18n/index.js'
import { fetchPriceHistory } from '../api/prices.js'
import { renderSparkline } from './chart.js'

const TF_LABELS = {
  15:   { fr: '15 min',   en: '15 min'  },
  30:   { fr: '30 min',   en: '30 min'  },
  60:   { fr: '1 heure',  en: '1 hour'  },
  240:  { fr: '4 heures', en: '4 hours' },
  480:  { fr: '8 heures', en: '8 hours' },
  1440: { fr: '24 heures',en: '24 hours'}
}

function upPercent (market) {
  const up = Number(market?.total_up_stakes || 0)
  const down = Number(market?.total_down_stakes || 0)
  const total = up + down
  if (total <= 0) return 50
  return Math.round((up / total) * 100)
}

function totalVol (market) {
  return Number(market?.total_up_stakes || 0) + Number(market?.total_down_stakes || 0)
}

// Volume agrégé tous timeframes confondus pour cet asset
function aggregateVol (markets) {
  return markets.reduce((sum, m) => sum + totalVol(m), 0)
}

// Symbole abrégé pour l'icône (BTC, ETH, etc.)
function iconText (asset) {
  const s = asset.symbol || asset.id
  return s.slice(0, 4)
}

// Génère la question affichée en titre du card
function buildQuestion (asset, lang) {
  const symbol = asset.symbol || asset.id
  if (lang === 'fr') {
    return `${symbol} en hausse ou en baisse ?`
  }
  return `${symbol} up or down?`
}

export function renderMarketCard ({ asset, price, markets = [], userLevel = 1, onTimeframeClick }) {
  const lang = getLang()
  const locked = (asset.min_level || 1) > userLevel

  const marketsByTf = {}
  markets.forEach(m => { if (m.timeframe_minutes) marketsByTf[m.timeframe_minutes] = m })

  const card = document.createElement('div')
  card.className = 'pm-card'
  card.dataset.assetId = asset.id

  const change = price?.change_24h
  const changeArrow = change == null ? '' : (change >= 0 ? '▲' : '▼')
  const changeClass = change == null ? '' : (change >= 0 ? 'text-up' : 'text-down')
  const totalVolAll = aggregateVol(markets)

  card.innerHTML = htmlRaw`
    <div class="pm-card-head">
      <div class="pm-icon pm-icon-${escHTML(asset.category)}">${escHTML(iconText(asset))}</div>
      <div class="pm-question-block">
        <div class="pm-question">${escHTML(buildQuestion(asset, lang))}</div>
        <div class="pm-price-line">
          <span>${escHTML(price ? formatPrice(price.price, asset.category) : '—')}</span>
          ${change == null ? '' : htmlRaw`<span class="${changeClass}">${changeArrow} ${escHTML(formatPct(Math.abs(change)))}</span>`}
        </div>
      </div>
      <div class="pm-spark">
        <canvas class="pm-spark-canvas" data-spark-asset="${escHTML(asset.id)}"></canvas>
      </div>
    </div>

    ${locked ? htmlRaw`
      <div class="pm-locked">
        🔒 ${lang === 'fr' ? `Niveau ${asset.min_level} requis` : `Level ${asset.min_level} required`}
      </div>
    ` : htmlRaw`
      <div class="pm-rows">
        ${[15, 30, 60, 240, 480, 1440].map(tf => {
          const m = marketsByTf[tf]
          const enabled = !!m
          const upPct = upPercent(m)
          const downPct = 100 - upPct
          const tfLabel = TF_LABELS[tf][lang]

          return htmlRaw`
            <div class="pm-row ${enabled ? '' : 'pm-row-disabled'}">
              <div class="pm-row-label">
                <span class="pm-row-tf">${escHTML(tfLabel)}</span>
                ${enabled ? htmlRaw`<span class="pm-row-cd" data-cd="${escHTML(m.resolves_at)}">—</span>` : ''}
              </div>
              <div class="pm-row-pct ${enabled && upPct >= 50 ? 'text-up' : enabled ? 'text-down' : 'text-mute'}">
                ${enabled ? upPct + '%' : '—'}
              </div>
              <div class="pm-row-actions">
                <button class="pm-yes" data-tf="${tf}" data-side="UP" ${enabled ? '' : 'disabled'}>
                  <span class="pm-yes-label">▲ ${lang === 'fr' ? 'Up' : 'Up'}</span>
                  <span class="pm-yes-pct">${enabled ? upPct + '%' : '—'}</span>
                </button>
                <button class="pm-no" data-tf="${tf}" data-side="DOWN" ${enabled ? '' : 'disabled'}>
                  <span class="pm-no-label">▼ ${lang === 'fr' ? 'Down' : 'Down'}</span>
                  <span class="pm-no-pct">${enabled ? downPct + '%' : '—'}</span>
                </button>
              </div>
            </div>
          `
        }).join('')}
      </div>
    `}

    <div class="pm-foot">
      ${markets.some(m => m.status === 'open') ? htmlRaw`<span class="pm-live">${lang === 'fr' ? 'En direct' : 'Live'}</span>` : ''}
      <span class="pm-foot-vol">${escHTML(totalVolAll > 0 ? formatEURCompact(totalVolAll) : '—')} Vol.</span>
      <span class="pm-foot-tag">${escHTML(asset.name)}</span>
    </div>
  `

  if (!locked && onTimeframeClick) {
    card.querySelectorAll('.pm-yes:not(:disabled), .pm-no:not(:disabled)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const tf = Number(btn.getAttribute('data-tf'))
        const side = btn.getAttribute('data-side')
        const m = marketsByTf[tf]
        onTimeframeClick(asset, m, side)
      })
    })
  }

  // Démarrer les countdowns
  card.querySelectorAll('[data-cd]').forEach(el => {
    const target = el.getAttribute('data-cd')
    if (target) startCountdown(el, target)
  })

  // Sparkline lazy : seulement pour les directional crypto (1h history)
  if (asset.category === 'crypto') {
    const canvas = card.querySelector('[data-spark-asset]')
    if (canvas) {
      // Lazy fetch + render quand la card est dans le viewport
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(async (entry) => {
          if (entry.isIntersecting) {
            observer.disconnect()
            const series = await fetchPriceHistory(asset.id, 1)
            if (series && series.length >= 3) {
              try { await renderSparkline(canvas, series) } catch (_) { /* CDN bloqué */ }
            } else {
              canvas.style.display = 'none'
            }
          }
        })
      }, { rootMargin: '100px' })
      observer.observe(canvas)
    }
  } else {
    // Pas de sparkline pour les autres catégories (volume insuffisant)
    const canvas = card.querySelector('[data-spark-asset]')
    if (canvas) canvas.parentElement.style.display = 'none'
  }

  return card
}
