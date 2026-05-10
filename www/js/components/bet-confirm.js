// ============================================================================
// PULSE PREDICT — Bet confirmation modal
// Affiche un récap (mise / levier / durée / gain potentiel) avant place_bet.
// Retourne Promise<boolean> : true = confirmé, false = annulé.
// ============================================================================

import { escHTML, htmlRaw } from '../utils/escHTML.js'
import { formatEUR } from '../utils/format.js'
import { hapticTap } from '../utils/haptic.js'
import { getLang } from '../i18n/index.js'

const TF_LABELS = { 15: '15 min', 30: '30 min', 60: '1 h', 240: '4 h', 480: '8 h', 1440: '24 h' }

// confirmBet({ asset, market, side, stake, leverage, potentialWin, isEvent })
// → Promise<boolean>
export function confirmBet ({ asset, market, side, stake, leverage, potentialWin, isEvent }) {
  return new Promise((resolve) => {
    const lang = getLang()
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay show'
    overlay.style.zIndex = '300'

    const sideLabel = isEvent
      ? (side === 'YES' ? '✅ OUI' : '❌ NON')
      : (side === 'UP' ? '▲ UP' : '▼ DOWN')
    const sideClass = (side === 'UP' || side === 'YES') ? 'text-up' : 'text-down'
    const title = isEvent
      ? (market.question || asset.name)
      : asset.name
    const sub = isEvent
      ? (market.outcome_label || market.subtitle || '')
      : (TF_LABELS[market.timeframe_minutes] || '')

    const card = document.createElement('div')
    card.className = 'bet-confirm-card'
    card.innerHTML = htmlRaw`
      <div class="bet-confirm-head">
        <div class="bet-confirm-title">${escHTML(title)}</div>
        <div class="bet-confirm-sub">${escHTML(sub)}</div>
      </div>

      <div class="bet-confirm-side ${sideClass}">${sideLabel}</div>

      <div class="bet-confirm-rows">
        <div class="bet-confirm-row">
          <span>${lang === 'fr' ? 'Mise' : 'Stake'}</span>
          <strong class="market-price">${escHTML(formatEUR(stake))}</strong>
        </div>
        <div class="bet-confirm-row">
          <span>${lang === 'fr' ? 'Levier' : 'Leverage'}</span>
          <strong>×${escHTML(leverage)}</strong>
        </div>
        <div class="bet-confirm-row">
          <span>${lang === 'fr' ? 'Exposition' : 'Exposure'}</span>
          <strong class="market-price">${escHTML(formatEUR(stake * leverage))}</strong>
        </div>
        <div class="bet-confirm-row bet-confirm-row-highlight">
          <span>${lang === 'fr' ? 'Gain potentiel' : 'Potential win'}</span>
          <strong class="market-price text-up">+${escHTML(formatEUR(potentialWin))}</strong>
        </div>
        <div class="bet-confirm-row">
          <span>${lang === 'fr' ? 'Perte max' : 'Max loss'}</span>
          <strong class="market-price text-down">−${escHTML(formatEUR(stake))}</strong>
        </div>
      </div>

      <div class="bet-confirm-actions">
        <button id="bc-cancel" class="btn btn-ghost">${lang === 'fr' ? 'Annuler' : 'Cancel'}</button>
        <button id="bc-confirm" class="btn btn-primary">${lang === 'fr' ? 'Confirmer 🚀' : 'Confirm 🚀'}</button>
      </div>
    `
    card.style.zIndex = '301'
    overlay.appendChild(card)
    document.body.appendChild(overlay)

    const close = (result) => {
      hapticTap()
      overlay.classList.remove('show')
      setTimeout(() => overlay.remove(), 200)
      resolve(result)
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false)
    })
    card.querySelector('#bc-cancel').addEventListener('click', () => close(false))
    card.querySelector('#bc-confirm').addEventListener('click', () => close(true))
  })
}
