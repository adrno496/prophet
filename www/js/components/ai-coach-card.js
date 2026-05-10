// ============================================================================
// PULSE PREDICT — AI Coach card
// Affiche une prédiction IA : pick, confiance, reasoning, boutons Suivre/Contre
// ============================================================================

import { escHTML, htmlRaw } from '../utils/escHTML.js'
import { getLang } from '../i18n/index.js'

const STATUS_BADGE = {
  pending:   { fr: '⏳ En cours',   en: '⏳ Pending',   cls: 'badge' },
  correct:   { fr: '✅ Correct',    en: '✅ Correct',   cls: 'badge-up' },
  incorrect: { fr: '❌ Raté',       en: '❌ Wrong',     cls: 'badge-down' }
}

function pickEmoji (assetId) {
  const map = { BTC: '₿', ETH: 'Ξ', SOL: '◎', DOGE: '🐕', BNB: '🟡', XRP: '🟦', ADA: '🟪', AVAX: '🔺' }
  return map[assetId] || '🪙'
}

// renderAICoachCard({ prediction, market, asset, onFollow, onAgainst })
// prediction : { id, ai_pick, ai_confidence, ai_reasoning, outcome, reference_id }
// market     : { id, asset_id, timeframe_minutes, resolves_at, status, ... }
// asset      : { id, symbol, name }
// onFollow   : (market, side) → void
// onAgainst  : (market, side) → void
export function renderAICoachCard ({ prediction, market, asset, onFollow, onAgainst }) {
  const lang = getLang()
  const pick = prediction.ai_pick
  const confidence = prediction.ai_confidence || 0
  const sb = STATUS_BADGE[prediction.outcome] || STATUS_BADGE.pending
  const pickArrow = pick === 'UP' ? '▲' : '▼'
  const pickClass = pick === 'UP' ? 'text-up' : 'text-down'

  const card = document.createElement('div')
  card.className = 'ai-coach-card'
  card.innerHTML = htmlRaw`
    <div class="ai-coach-head">
      <div class="ai-coach-icon">🤖</div>
      <div class="stack" style="gap:2px;flex:1;min-width:0">
        <div class="ai-coach-title">
          ${pickEmoji(asset?.id || market?.asset_id)}
          ${escHTML(asset?.symbol || asset?.id || market?.asset_id || '?')}
          <span class="${pickClass}" style="font-weight:900;margin-left:4px">${pickArrow} ${pick}</span>
        </div>
        <div class="ai-coach-sub">
          ${escHTML(timeframe(market))} · <span class="badge ${sb.cls}" style="font-size:9px;padding:1px 6px">${escHTML(sb[lang])}</span>
        </div>
      </div>
      <div class="ai-coach-conf" title="${lang === 'fr' ? 'Confiance' : 'Confidence'}">
        <div class="ai-coach-conf-value">${confidence}%</div>
        <div class="ai-coach-conf-bar">
          <div class="ai-coach-conf-fill" style="width:${confidence}%;background:${confColor(confidence)}"></div>
        </div>
      </div>
    </div>

    <div class="ai-coach-reasoning">${escHTML(prediction.ai_reasoning || '—')}</div>

    ${prediction.outcome === 'pending' && market?.status === 'open' && onFollow ? htmlRaw`
      <div class="ai-coach-actions">
        <button class="btn-coach btn-coach-follow" data-action="follow">
          ${lang === 'fr' ? '🤝 Suivre l\'IA' : '🤝 Follow AI'}
        </button>
        <button class="btn-coach btn-coach-against" data-action="against">
          ${lang === 'fr' ? '⚔️ Contre l\'IA' : '⚔️ Against AI'}
        </button>
      </div>
    ` : ''}
  `

  if (onFollow && onAgainst) {
    card.querySelector('[data-action="follow"]')?.addEventListener('click', () => onFollow(market, pick))
    const oppositeSide = pick === 'UP' ? 'DOWN' : 'UP'
    card.querySelector('[data-action="against"]')?.addEventListener('click', () => onAgainst(market, oppositeSide))
  }

  return card
}

function timeframe (market) {
  if (!market?.timeframe_minutes) return '—'
  const m = market.timeframe_minutes
  if (m >= 1440) return `${m / 1440}j`
  if (m >= 60) return `${m / 60}h`
  return `${m}min`
}

function confColor (c) {
  if (c >= 75) return 'var(--neon)'
  if (c >= 60) return 'var(--primary)'
  return 'var(--warning)'
}
