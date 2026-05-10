// ============================================================================
// PROPHET — Event card (Polymarket-style)
// 3 layouts auto-détectés :
//   - SINGLE BINARY    : 1 marché, juste Yes/No
//   - MULTI-OUTCOME    : N marchés même topic, chaque outcome une ligne
//   - MULTI-DEADLINE   : N marchés même question, dates différentes en lignes
// ============================================================================

import { escHTML, htmlRaw } from '../utils/escHTML.js'
import { formatEURCompact } from '../utils/format.js'
import { startCountdown } from './countdown.js'
import { getLang } from '../i18n/index.js'

function yesPercent (m) {
  const up = Number(m?.total_up_stakes || 0)
  const dn = Number(m?.total_down_stakes || 0)
  const total = up + dn
  if (total <= 0) {
    // Heuristique : utilise sort_order comme proxy de probabilité initiale
    return Math.max(5, Math.min(95, Math.round((m?.sort_order || 50))))
  }
  return Math.round((up / total) * 100)
}

function vol (m) {
  return Number(m?.total_up_stakes || 0) + Number(m?.total_down_stakes || 0)
}

function totalVol (markets) {
  return markets.reduce((s, m) => s + vol(m), 0)
}

// Détecte le layout : si plusieurs markets et même question → multi-deadline
//                    si plusieurs markets et outcome_label différents → multi-outcome
//                    sinon → single
function detectLayout (markets) {
  if (markets.length === 1) return 'single'
  const distinctQuestions = new Set(markets.map(m => m.question))
  const hasOutcomes = markets.some(m => m.outcome_label)
  if (distinctQuestions.size === 1 && !hasOutcomes) return 'multi-deadline-by-time'
  if (distinctQuestions.size === 1 && hasOutcomes) return 'multi-outcome'
  // Plusieurs questions distinctes : on traite comme multi-deadline (chacune sa ligne)
  return 'multi-deadline'
}

// Génère la ligne "Yes XX% / No YY%" pour un market donné
function renderRow (m, lang) {
  const yesPct = yesPercent(m)
  const noPct = 100 - yesPct
  const labelMain = m.outcome_label || m.subtitle || (lang === 'fr' ? 'Oui / Non' : 'Yes / No')

  return htmlRaw`
    <div class="ev-row" data-market-id="${escHTML(m.id)}">
      <div class="ev-row-main">
        <div class="ev-row-label">
          <span class="ev-row-name">${escHTML(labelMain || (lang === 'fr' ? 'Oui / Non' : 'Yes / No'))}</span>
          ${m.resolves_at ? htmlRaw`<span class="ev-row-cd" data-cd="${escHTML(m.resolves_at)}">—</span>` : ''}
        </div>
        <div class="ev-row-pct ${yesPct >= 50 ? 'text-up' : 'text-down'}">${yesPct}%</div>
      </div>
      <div class="ev-row-actions">
        <button class="ev-yes" data-market-id="${escHTML(m.id)}" data-side="YES">
          <span class="ev-yes-label">${lang === 'fr' ? 'Oui' : 'Yes'}</span>
          <span class="ev-yes-pct">${yesPct}%</span>
        </button>
        <button class="ev-no" data-market-id="${escHTML(m.id)}" data-side="NO">
          <span class="ev-no-label">${lang === 'fr' ? 'Non' : 'No'}</span>
          <span class="ev-no-pct">${noPct}%</span>
        </button>
      </div>
    </div>
  `
}

// renderEventCard({ group, onBet })
// group = { key, topic, image_emoji, markets[], subtitle?, question? }
export function renderEventCard ({ group, onBet }) {
  const lang = getLang()
  const layout = detectLayout(group.markets)
  const card = document.createElement('div')
  card.className = 'ev-card'

  // Trier les markets par sort_order desc puis resolves_at asc
  const sortedMarkets = [...group.markets].sort((a, b) => {
    const so = (b.sort_order || 0) - (a.sort_order || 0)
    if (so !== 0) return so
    return new Date(a.resolves_at) - new Date(b.resolves_at)
  })

  const headerImg = group.image_emoji || sortedMarkets[0]?.image_emoji || '❓'
  const title = layout === 'multi-deadline-by-time' || layout === 'multi-outcome'
    ? sortedMarkets[0]?.question || group.topic
    : (group.topic && group.topic !== sortedMarkets[0]?.question ? group.topic : sortedMarkets[0]?.question)

  const totalV = totalVol(group.markets)
  const subtitleTag = sortedMarkets[0]?.subtitle || group.topic

  card.innerHTML = htmlRaw`
    <div class="ev-head">
      <div class="ev-icon">${headerImg}</div>
      <div class="ev-title-block">
        <div class="ev-title">${escHTML(title || '')}</div>
        ${subtitleTag && subtitleTag !== title ? htmlRaw`<div class="ev-subtitle">${escHTML(subtitleTag)}</div>` : ''}
      </div>
    </div>

    <div class="ev-rows">
      ${sortedMarkets.slice(0, 6).map(m => renderRow(m, lang)).join('')}
    </div>

    ${sortedMarkets.length > 6 ? htmlRaw`
      <details class="ev-more">
        <summary>+ ${sortedMarkets.length - 6} ${lang === 'fr' ? 'autres' : 'more'}</summary>
        ${sortedMarkets.slice(6).map(m => renderRow(m, lang)).join('')}
      </details>
    ` : ''}

    <div class="ev-foot">
      <span class="pm-live">${lang === 'fr' ? 'En direct' : 'Live'}</span>
      <span class="ev-foot-vol">${escHTML(totalV > 0 ? formatEURCompact(totalV) : '—')} Vol.</span>
      ${group.topic ? htmlRaw`<span class="ev-foot-tag">${escHTML(group.topic)}</span>` : ''}
    </div>
  `

  // Bind clicks
  if (onBet) {
    card.querySelectorAll('.ev-yes, .ev-no').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation()
        const mid = btn.getAttribute('data-market-id')
        const side = btn.getAttribute('data-side')
        const m = sortedMarkets.find(mm => mm.id === mid)
        if (m) onBet({ market: m, side, group })
      })
    })
  }

  // Countdowns
  card.querySelectorAll('[data-cd]').forEach(el => {
    const t = el.getAttribute('data-cd')
    if (t) startCountdown(el, t)
  })

  return card
}
